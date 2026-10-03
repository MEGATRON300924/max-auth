import crypto from "crypto";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API_URL = "https://open.tiktokapis.com";
const STATE_TTL_MS = 10 * 60 * 1000;
const SCOPES = ["user.info.basic", "video.list"];

function ensureConfigured() {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET || !env.TIKTOK_REDIRECT_URI || !env.TIKTOK_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("TikTok integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
}
function key() {
  if (!env.TIKTOK_TOKEN_ENCRYPTION_KEY) throw new AppError("TikTok integration encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  return crypto.createHash("sha256").update(env.TIKTOK_TOKEN_ENCRYPTION_KEY).digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new AppError("Invalid encrypted TikTok credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function hash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function random(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }

async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) } });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || (body?.error?.code && body.error.code !== "ok")) {
    throw AppError.badRequest(body?.error_description || body?.error?.message || body?.message || "TikTok request failed", "TIKTOK_REQUEST_FAILED", { status: response.status });
  }
  return body;
}

async function tokenRequest(form: URLSearchParams) {
  return request(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: form.toString(),
  });
}

export const tiktokService = {
  async createAuthorizationUrl(userId: string) {
    ensureConfigured();
    const state = random();
    await prisma.oAuthIntegrationState.create({
      data: {
        provider: ConnectedProvider.TIKTOK,
        stateHash: hash(state),
        userId,
        verifierEnc: encrypt(state),
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    const params = new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      response_type: "code",
      scope: SCOPES.join(","),
      redirect_uri: env.TIKTOK_REDIRECT_URI,
      state,
    });
    return AUTHORIZE_URL + "?" + params.toString();
  },

  async callback(query: { code?: string; state?: string; error?: string; error_description?: string }, ctx: { ipAddress?: string; userAgent?: string }) {
    ensureConfigured();
    if (query.error) throw AppError.badRequest(query.error_description || "TikTok authorization was cancelled", "TIKTOK_ACCESS_DENIED");
    if (!query.code || !query.state) throw AppError.badRequest("TikTok authorization response was incomplete", "TIKTOK_CALLBACK_INVALID");

    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: hash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.TIKTOK || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest("Invalid or expired TikTok authorization state", "TIKTOK_STATE_INVALID");
    }
    const claimed = await prisma.oAuthIntegrationState.updateMany({
      where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw AppError.badRequest("TikTok authorization state has already been used", "TIKTOK_STATE_REPLAYED");

    const token = await tokenRequest(new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      code: query.code,
      grant_type: "authorization_code",
      redirect_uri: env.TIKTOK_REDIRECT_URI,
    }));

    if (!token?.access_token || !token?.open_id) throw AppError.badRequest("TikTok did not return a valid access token", "TIKTOK_TOKEN_INVALID");

    const existing = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: ConnectedProvider.TIKTOK, providerAccountId: String(token.open_id) } },
    });
    if (existing && existing.userId !== oauthState.userId) throw AppError.conflict("This TikTok account is already connected to another MAX Account");

    await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider: ConnectedProvider.TIKTOK, providerAccountId: String(token.open_id) } },
      create: {
        userId: oauthState.userId,
        provider: ConnectedProvider.TIKTOK,
        providerAccountId: String(token.open_id),
        accessTokenEnc: encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null,
        scope: token.scope || SCOPES.join(","),
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
      },
      update: {
        userId: oauthState.userId,
        accessTokenEnc: encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null,
        scope: token.scope || SCOPES.join(","),
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
      },
    });

    await auditService.record("CONNECTED_ACCOUNT_LINKED", {
      userId: oauthState.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { provider: "TIKTOK", tiktokAccountId: String(token.open_id) },
    });
    return { status: "connected" as const };
  },

  async accessToken(userId: string) {
    ensureConfigured();
    let account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.TIKTOK } });
    if (!account?.accessTokenEnc) throw AppError.notFound("TikTok is not connected");
    if (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() - Date.now() < 15 * 60 * 1000) {
      if (!account.refreshTokenEnc) throw AppError.unauthorized("Your TikTok connection expired. Please reconnect TikTok.", "TIKTOK_REAUTH_REQUIRED");
      await this.refresh(userId);
      account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.TIKTOK } });
    }
    if (!account?.accessTokenEnc) throw AppError.notFound("TikTok is not connected");
    return decrypt(account.accessTokenEnc);
  },

  async refresh(userId: string) {
    ensureConfigured();
    const account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.TIKTOK } });
    if (!account?.refreshTokenEnc) throw AppError.badRequest("TikTok refresh is unavailable; reconnect TikTok", "TIKTOK_REFRESH_UNAVAILABLE");

    const token = await tokenRequest(new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshTokenEnc),
    }));
    if (!token?.access_token) throw AppError.badRequest("TikTok did not return a refreshed access token", "TIKTOK_REFRESH_INVALID");

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : account.refreshTokenEnc,
        scope: token.scope || account.scope,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : account.tokenExpiresAt,
      },
    });
    return { status: "refreshed" as const };
  },

  async me(userId: string) {
    const response = await request(API_URL + "/v2/user/info/?fields=open_id,avatar_url,display_name", {
      headers: { Authorization: "Bearer " + await this.accessToken(userId) },
    });
    return response?.data?.user || response?.user || response;
  },

  async videos(userId: string) {
    const response = await request(API_URL + "/v2/video/list/?fields=id,create_time,title,video_description,duration,cover_image_url,share_url,embed_link", {
      method: "POST",
      headers: { Authorization: "Bearer " + await this.accessToken(userId), "Content-Type": "application/json" },
      body: JSON.stringify({ max_count: 20 }),
    });
    return response?.data || response;
  },
};
