import crypto from "crypto";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";
const DISCORD_API_URL = "https://discord.com/api/v10";
const DISCORD_SCOPES = ["identify", "email", "guilds"];
const STATE_TTL_MS = 10 * 60 * 1000;

function ensureConfigured() {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI || !env.DISCORD_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("Discord integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
}
function key(): Buffer {
  if (!env.DISCORD_TOKEN_ENCRYPTION_KEY) throw new AppError("Discord integration encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  return crypto.createHash("sha256").update(env.DISCORD_TOKEN_ENCRYPTION_KEY).digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new AppError("Invalid encrypted Discord credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function stateHash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function randomState() { return crypto.randomBytes(32).toString("base64url"); }

async function discordRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw AppError.badRequest(body?.message || body?.error_description || "Discord request failed", "DISCORD_REQUEST_FAILED", { status: response.status });
  return body;
}

export const discordService = {
  async createAuthorizationUrl(userId: string) {
    ensureConfigured();
    const state = randomState();
    await prisma.oAuthIntegrationState.create({
      data: { provider: ConnectedProvider.DISCORD, stateHash: stateHash(state), userId, verifierEnc: encrypt(state), expiresAt: new Date(Date.now() + STATE_TTL_MS) },
    });
    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, redirect_uri: env.DISCORD_REDIRECT_URI, response_type: "code",
      scope: DISCORD_SCOPES.join(" "), state,
    });
    return DISCORD_AUTHORIZE_URL + "?" + params.toString();
  },

  async handleCallback(query: { code?: string; state?: string; error?: string }) {
    ensureConfigured();
    if (query.error) {
      if (query.state) await prisma.oAuthIntegrationState.deleteMany({ where: { provider: ConnectedProvider.DISCORD, stateHash: stateHash(query.state) } });
      throw AppError.badRequest("Discord authorization was cancelled", "DISCORD_ACCESS_DENIED");
    }
    if (!query.code || !query.state) throw AppError.badRequest("Discord authorization response was incomplete", "DISCORD_CALLBACK_INVALID");
    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: stateHash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.DISCORD || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest("Invalid or expired Discord authorization state", "DISCORD_STATE_INVALID");
    }
    const claimed = await prisma.oAuthIntegrationState.updateMany({ where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw AppError.badRequest("Discord authorization state has already been used", "DISCORD_STATE_REPLAYED");

    const basic = Buffer.from(env.DISCORD_CLIENT_ID + ":" + env.DISCORD_CLIENT_SECRET).toString("base64");
    const token = await discordRequest(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basic },
      body: new URLSearchParams({ grant_type: "authorization_code", code: query.code, redirect_uri: env.DISCORD_REDIRECT_URI }),
    });
    const profile = await discordRequest(DISCORD_API_URL + "/users/@me", { headers: { Authorization: "Bearer " + token.access_token } });
    if (!profile?.id) throw AppError.badRequest("Discord did not return a stable account identifier", "DISCORD_PROFILE_INVALID");

    const existing = await prisma.connectedAccount.findUnique({ where: { provider_providerAccountId: { provider: ConnectedProvider.DISCORD, providerAccountId: String(profile.id) } } });
    if (existing && existing.userId !== oauthState.userId) throw AppError.conflict("This Discord account is already connected to another MAX Account");

    await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider: ConnectedProvider.DISCORD, providerAccountId: String(profile.id) } },
      create: {
        userId: oauthState.userId, provider: ConnectedProvider.DISCORD, providerAccountId: String(profile.id),
        accessTokenEnc: encrypt(token.access_token), refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null,
        scope: token.scope || DISCORD_SCOPES.join(" "), tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 604800) * 1000),
      },
      update: {
        userId: oauthState.userId, accessTokenEnc: encrypt(token.access_token),
        ...(token.refresh_token ? { refreshTokenEnc: encrypt(token.refresh_token) } : {}),
        scope: token.scope || DISCORD_SCOPES.join(" "), tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 604800) * 1000),
      },
    });
    await auditService.record("CONNECTED_ACCOUNT_LINKED", { userId: oauthState.userId, metadata: { provider: "DISCORD", discordAccountId: String(profile.id) } });
    return { status: "connected" as const };
  },

  async accessToken(userId: string) {
    ensureConfigured();
    let account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.DISCORD } });
    if (!account?.accessTokenEnc) throw AppError.notFound("Discord is not connected");
    if (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
      if (!account.refreshTokenEnc) throw AppError.unauthorized("Discord authorization expired. Please reconnect Discord.", "DISCORD_REAUTH_REQUIRED");
      const refreshToken = decrypt(account.refreshTokenEnc);
      const basic = Buffer.from(env.DISCORD_CLIENT_ID + ":" + env.DISCORD_CLIENT_SECRET).toString("base64");
      try {
        const refreshed = await discordRequest(DISCORD_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basic },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
        });
        account = await prisma.connectedAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEnc: encrypt(refreshed.access_token),
            ...(refreshed.refresh_token ? { refreshTokenEnc: encrypt(refreshed.refresh_token) } : {}),
            scope: refreshed.scope || account.scope,
            tokenExpiresAt: new Date(Date.now() + Number(refreshed.expires_in || 604800) * 1000),
          },
        });
      } catch (error) {
        if (error instanceof AppError && /invalid_grant|invalid credentials|unauthorized/i.test(error.message)) {
          await prisma.connectedAccount.delete({ where: { id: account.id } }).catch(() => undefined);
          await auditService.record("CONNECTED_ACCOUNT_UNLINKED", { userId, metadata: { provider: "DISCORD", reason: "refresh_token_invalid" } });
          throw AppError.unauthorized("Your Discord connection expired. Please connect Discord again.", "DISCORD_REAUTH_REQUIRED");
        }
        throw error;
      }
    }
    return decrypt(account.accessTokenEnc!);
  },

  async apiRequest(userId: string, path: string) {
    const token = await this.accessToken(userId);
    return discordRequest(DISCORD_API_URL + path, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  },
  async me(userId: string) { return this.apiRequest(userId, "/users/@me"); },
  async guilds(userId: string) { return this.apiRequest(userId, "/users/@me/guilds"); },
};
