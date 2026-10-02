import crypto from "crypto";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const API_URL = "https://api.x.com/2";
const STATE_TTL_MS = 10 * 60 * 1000;
const SCOPES = ["users.read", "tweet.read", "offline.access"];

function ensureConfigured() {
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET || !env.X_REDIRECT_URI || !env.X_TOKEN_ENCRYPTION_KEY) throw new AppError("X integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
}
function key() {
  if (!env.X_TOKEN_ENCRYPTION_KEY) throw new AppError("X integration encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  return crypto.createHash("sha256").update(env.X_TOKEN_ENCRYPTION_KEY).digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new AppError("Invalid encrypted X credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function hash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function random(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }
function pkceChallenge(verifier: string) { return crypto.createHash("sha256").update(verifier).digest("base64url"); }

async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) } });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw AppError.badRequest(body?.detail || body?.error_description || body?.title || "X request failed", "X_REQUEST_FAILED", { status: response.status });
  return body;
}

export const xService = {
  async createAuthorizationUrl(userId: string) {
    ensureConfigured();
    const state = random();
    const verifier = random(64);
    await prisma.oAuthIntegrationState.create({ data: { provider: ConnectedProvider.X, stateHash: hash(state), userId, verifierEnc: encrypt(verifier), expiresAt: new Date(Date.now() + STATE_TTL_MS) } });
    const params = new URLSearchParams({ response_type: "code", client_id: env.X_CLIENT_ID, redirect_uri: env.X_REDIRECT_URI, scope: SCOPES.join(" "), state, code_challenge: pkceChallenge(verifier), code_challenge_method: "S256" });
    return AUTHORIZE_URL + "?" + params.toString();
  },

  async handleCallback(query: { code?: string; state?: string; error?: string }, ctx: { ipAddress?: string; userAgent?: string }) {
    ensureConfigured();
    if (query.error) { if (query.state) await prisma.oAuthIntegrationState.deleteMany({ where: { provider: ConnectedProvider.X, stateHash: hash(query.state) } }); throw AppError.badRequest("X authorization was cancelled", "X_ACCESS_DENIED"); }
    if (!query.code || !query.state) throw AppError.badRequest("X authorization response was incomplete", "X_CALLBACK_INVALID");
    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: hash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.X || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) throw AppError.badRequest("Invalid or expired X authorization state", "X_STATE_INVALID");
    const claimed = await prisma.oAuthIntegrationState.updateMany({ where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw AppError.badRequest("X authorization state has already been used", "X_STATE_REPLAYED");
    const verifier = decrypt(oauthState.verifierEnc);
    const basic = Buffer.from(env.X_CLIENT_ID + ":" + env.X_CLIENT_SECRET).toString("base64");
    const body = new URLSearchParams({ code: query.code, grant_type: "authorization_code", redirect_uri: env.X_REDIRECT_URI, code_verifier: verifier });
    const tokenResponse = await request(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basic }, body: body.toString() });
    if (!tokenResponse?.access_token) throw AppError.badRequest("X did not return an access token", "X_TOKEN_INVALID");
    const profile = await request(API_URL + "/users/me?user.fields=id,name,username,profile_image_url");
    const user = profile?.data;
    if (!user?.id) throw AppError.badRequest("X did not return a stable account identifier", "X_PROFILE_INVALID");
    const existing = await prisma.connectedAccount.findUnique({ where: { provider_providerAccountId: { provider: ConnectedProvider.X, providerAccountId: String(user.id) } } });
    if (existing && existing.userId !== oauthState.userId) throw AppError.conflict("This X account is already connected to another MAX Account");
    await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider: ConnectedProvider.X, providerAccountId: String(user.id) } },
      create: { userId: oauthState.userId, provider: ConnectedProvider.X, providerAccountId: String(user.id), accessTokenEnc: encrypt(tokenResponse.access_token), refreshTokenEnc: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : null, scope: tokenResponse.scope || SCOPES.join(" "), tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000) : null },
      update: { userId: oauthState.userId, accessTokenEnc: encrypt(tokenResponse.access_token), refreshTokenEnc: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : null, scope: tokenResponse.scope || SCOPES.join(" "), tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000) : null },
    });
    await auditService.record("CONNECTED_ACCOUNT_LINKED", { userId: oauthState.userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider: "X", xAccountId: String(user.id), username: user.username } });
    return { status: "connected" as const };
  },

  async accessToken(userId: string) {
    ensureConfigured();
    const account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.X } });
    if (!account?.accessTokenEnc) throw AppError.notFound("X is not connected");
    return decrypt(account.accessTokenEnc);
  },
  async me(userId: string) { return request(API_URL + "/users/me?user.fields=id,name,username,profile_image_url,description,public_metrics", { headers: { Authorization: "Bearer " + await this.accessToken(userId) } }); },
  async posts(userId: string) { const profile = await this.me(userId); return request(API_URL + "/users/" + profile.data.id + "/tweets?max_results=20&tweet.fields=created_at,public_metrics", { headers: { Authorization: "Bearer " + await this.accessToken(userId) } }); },
};