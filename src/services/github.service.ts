import crypto from "crypto";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const STATE_TTL_MS = 10 * 60 * 1000;

function ensureConfigured() {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_REDIRECT_URI || !env.GITHUB_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("GitHub integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
}
function key(): Buffer {
  if (!env.GITHUB_TOKEN_ENCRYPTION_KEY) throw new AppError("GitHub integration encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  return crypto.createHash("sha256").update(env.GITHUB_TOKEN_ENCRYPTION_KEY).digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new AppError("Invalid encrypted GitHub credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function stateHash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function randomState() { return crypto.randomBytes(32).toString("base64url"); }

async function githubRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw AppError.badRequest(body?.message || body?.error_description || "GitHub request failed", "GITHUB_REQUEST_FAILED", { status: response.status });
  }
  return body;
}

export const githubService = {
  async createAuthorizationUrl(userId: string) {
    ensureConfigured();
    const state = randomState();
    await prisma.oAuthIntegrationState.create({
      data: {
        provider: ConnectedProvider.GITHUB,
        stateHash: stateHash(state),
        userId,
        verifierEnc: encrypt(state),
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_REDIRECT_URI,
      state,
    });
    return GITHUB_AUTHORIZE_URL + "?" + params.toString();
  },

  async handleCallback(query: { code?: string; state?: string; error?: string }, ctx: { ipAddress?: string; userAgent?: string }) {
    ensureConfigured();
    if (query.error) {
      if (query.state) await prisma.oAuthIntegrationState.deleteMany({ where: { provider: ConnectedProvider.GITHUB, stateHash: stateHash(query.state) } });
      throw AppError.badRequest("GitHub authorization was cancelled", "GITHUB_ACCESS_DENIED");
    }
    if (!query.code || !query.state) throw AppError.badRequest("GitHub authorization response was incomplete", "GITHUB_CALLBACK_INVALID");

    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: stateHash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.GITHUB || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest("Invalid or expired GitHub authorization state", "GITHUB_STATE_INVALID");
    }
    const claimed = await prisma.oAuthIntegrationState.updateMany({
      where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw AppError.badRequest("GitHub authorization state has already been used", "GITHUB_STATE_REPLAYED");

    const tokenResponse = await githubRequest(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: query.code,
        redirect_uri: env.GITHUB_REDIRECT_URI,
      }),
    });
    if (!tokenResponse?.access_token) throw AppError.badRequest("GitHub did not return an access token", "GITHUB_TOKEN_INVALID");

    const profile = await githubRequest(GITHUB_API_URL + "/user", {
      headers: { Authorization: "Bearer " + tokenResponse.access_token },
    });
    if (!profile?.id) throw AppError.badRequest("GitHub did not return a stable account identifier", "GITHUB_PROFILE_INVALID");

    const existing = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: ConnectedProvider.GITHUB, providerAccountId: String(profile.id) } },
    });
    if (existing && existing.userId !== oauthState.userId) throw AppError.conflict("This GitHub account is already connected to another MAX Account");

    await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider: ConnectedProvider.GITHUB, providerAccountId: String(profile.id) } },
      create: {
        userId: oauthState.userId,
        provider: ConnectedProvider.GITHUB,
        providerAccountId: String(profile.id),
        accessTokenEnc: encrypt(tokenResponse.access_token),
        refreshTokenEnc: null,
        scope: tokenResponse.scope || null,
        tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000) : null,
      },
      update: {
        userId: oauthState.userId,
        accessTokenEnc: encrypt(tokenResponse.access_token),
        refreshTokenEnc: null,
        scope: tokenResponse.scope || null,
        tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000) : null,
      },
    });

    await auditService.record("CONNECTED_ACCOUNT_LINKED", {
      userId: oauthState.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { provider: "GITHUB", githubAccountId: String(profile.id) },
    });
    return { status: "connected" as const };
  },

  async accessToken(userId: string) {
    ensureConfigured();
    const account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.GITHUB } });
    if (!account?.accessTokenEnc) throw AppError.notFound("GitHub is not connected");
    return decrypt(account.accessTokenEnc);
  },

  async me(userId: string) {
    return githubRequest(GITHUB_API_URL + "/user", {
      headers: { Authorization: "Bearer " + await this.accessToken(userId) },
    });
  },

  async repos(userId: string) {
    return githubRequest(GITHUB_API_URL + "/user/repos?sort=updated&per_page=100", {
      headers: { Authorization: "Bearer " + await this.accessToken(userId) },
    });
  },
};
