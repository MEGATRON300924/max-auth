import crypto from "crypto";
import { Request } from "express";
import { prisma } from "../database/prisma";
import { ConnectedProvider } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";
const SPOTIFY_SCOPES = ["user-read-private", "user-read-email"];
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const STATE_TTL_MS = 10 * 60 * 1000;

function encryptionKey(): Buffer {
  if (!env.SPOTIFY_TOKEN_ENCRYPTION_KEY) throw new AppError("Spotify integration encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  return crypto.createHash("sha256").update(env.SPOTIFY_TOKEN_ENCRYPTION_KEY).digest();
}
function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decrypt(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new AppError("Invalid encrypted Spotify credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}
function randomBase64Url(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }
function pkceChallenge(verifier: string) { return crypto.createHash("sha256").update(verifier).digest("base64url"); }
function stateHash(state: string) { return crypto.createHash("sha256").update(state).digest("hex"); }
function ensureGoogleConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("Google Calendar integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
}
function googleEncryptionKey(): Buffer {
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY) throw new AppError("Google Calendar encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  return crypto.createHash("sha256").update(env.GOOGLE_TOKEN_ENCRYPTION_KEY).digest();
}
function googleEncrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", googleEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function googleDecrypt(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new AppError("Invalid encrypted Google credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", googleEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}
async function googleRequest(url: string, options: RequestInit): Promise<any> {
  const response = await fetch(url, options);
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body?.error_description ||
      body?.error?.message ||
      body?.error ||
      "Google request failed";
    throw AppError.badRequest(String(message), "GOOGLE_REQUEST_FAILED", {
      status: response.status,
      error: body?.error,
    });
  }
  return body;
}

function ensureConfigured() {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET || !env.SPOTIFY_REDIRECT_URI || !env.SPOTIFY_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("Spotify integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
}
async function spotifyRequest(url: string, options: RequestInit): Promise<any> {
  const response = await fetch(url, options);
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error_description || body?.error?.message || "Spotify request failed";
    throw AppError.badRequest(message, "SPOTIFY_REQUEST_FAILED");
  }
  return body;
}

export const connectedAccountsService = {
  list(userId: string) {
    return prisma.connectedAccount.findMany({
      where: { userId },
      select: { id: true, provider: true, scope: true, tokenExpiresAt: true, linkedAt: true, updatedAt: true },
    });
  },

  async link(userId: string, provider: ConnectedProvider, data: { providerAccountId: string; accessTokenEnc?: string; refreshTokenEnc?: string; scope?: string; tokenExpiresAt?: Date }, ctx: { ipAddress?: string; userAgent?: string }) {
    const existing = await prisma.connectedAccount.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: data.providerAccountId } } });
    if (existing && existing.userId !== userId) throw AppError.conflict("This provider account is already connected to another MAX Account");
    const account = await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId: data.providerAccountId } },
      create: { userId, provider, ...data },
      update: { userId, ...data },
    });
    await auditService.record("CONNECTED_ACCOUNT_LINKED", { userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider } });
    return account;
  },

  async unlink(userId: string, connectedAccountId: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const account = await prisma.connectedAccount.findUnique({ where: { id: connectedAccountId } });
    if (!account || account.userId !== userId) throw AppError.notFound("Connected account not found");
    await prisma.connectedAccount.delete({ where: { id: connectedAccountId } });
    await auditService.record("CONNECTED_ACCOUNT_UNLINKED", { userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider: account.provider } });
  },

  async createSpotifyAuthorizationUrl(userId: string) {
    ensureConfigured();
    const verifier = randomBase64Url(64);
    const state = randomBase64Url(32);
    await prisma.oAuthIntegrationState.create({ data: {
      provider: ConnectedProvider.SPOTIFY, stateHash: stateHash(state), userId, verifierEnc: encrypt(verifier), expiresAt: new Date(Date.now() + STATE_TTL_MS),
    } });
    const params = new URLSearchParams({
      response_type: "code", client_id: env.SPOTIFY_CLIENT_ID, redirect_uri: env.SPOTIFY_REDIRECT_URI,
      scope: SPOTIFY_SCOPES.join(" "), state, code_challenge_method: "S256", code_challenge: pkceChallenge(verifier),
    });
    return SPOTIFY_AUTHORIZE_URL + "?" + params.toString();
  },

  async handleSpotifyCallback(query: { code?: string; state?: string; error?: string }, req: Request) {
    ensureConfigured();
    if (query.error) {
      if (query.state) await prisma.oAuthIntegrationState.deleteMany({ where: { provider: ConnectedProvider.SPOTIFY, stateHash: stateHash(query.state) } });
      throw AppError.badRequest("Spotify authorization was cancelled", "SPOTIFY_ACCESS_DENIED");
    }
    if (!query.code || !query.state) throw AppError.badRequest("Spotify authorization response was incomplete", "SPOTIFY_CALLBACK_INVALID");
    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: stateHash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.SPOTIFY || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest("Invalid or expired Spotify authorization state", "SPOTIFY_STATE_INVALID");
    }
    const claimed = await prisma.oAuthIntegrationState.updateMany({
      where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw AppError.badRequest("Spotify authorization state has already been used", "SPOTIFY_STATE_REPLAYED");

    const verifier = decrypt(oauthState.verifierEnc);
    const basic = Buffer.from(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET).toString("base64");
    let token: any;
    let profile: any;
    try {
      token = await spotifyRequest(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basic },
        body: new URLSearchParams({ grant_type: "authorization_code", code: query.code, redirect_uri: env.SPOTIFY_REDIRECT_URI, code_verifier: verifier }),
      });
      profile = await spotifyRequest(SPOTIFY_ME_URL, { headers: { Authorization: "Bearer " + token.access_token } });
    } catch (error) {
      throw error;
    }

    const existing = await prisma.connectedAccount.findUnique({ where: { provider_providerAccountId: { provider: ConnectedProvider.SPOTIFY, providerAccountId: profile.id } } });
    if (existing && existing.userId !== oauthState.userId) throw AppError.conflict("This Spotify account is already connected to another MAX Account");
    await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider: ConnectedProvider.SPOTIFY, providerAccountId: profile.id } },
      create: { userId: oauthState.userId, provider: ConnectedProvider.SPOTIFY, providerAccountId: profile.id, accessTokenEnc: encrypt(token.access_token), refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null, scope: token.scope || SPOTIFY_SCOPES.join(" "), tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000) },
      update: { userId: oauthState.userId, accessTokenEnc: encrypt(token.access_token), ...(token.refresh_token ? { refreshTokenEnc: encrypt(token.refresh_token) } : {}), scope: token.scope || SPOTIFY_SCOPES.join(" "), tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000) },
    });
    await auditService.record("CONNECTED_ACCOUNT_LINKED", { userId: oauthState.userId, ipAddress: req.ip, userAgent: req.headers["user-agent"], metadata: { provider: "SPOTIFY", spotifyAccountId: profile.id } });
    return { status: "connected" as const };
  },

  async createGoogleCalendarAuthorizationUrl(userId: string) {
    ensureGoogleConfigured();
    const existingGoogle = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.GOOGLE } });
    if (!existingGoogle) throw AppError.badRequest("Connect your Google identity to MAX before connecting Google Calendar", "GOOGLE_IDENTITY_REQUIRED");
    const verifier = randomBase64Url(64);
    const state = randomBase64Url(32);
    await prisma.oAuthIntegrationState.create({ data: { provider: ConnectedProvider.GOOGLE, stateHash: stateHash(state), userId, verifierEnc: googleEncrypt(verifier), expiresAt: new Date(Date.now() + STATE_TTL_MS) } });
    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: "code", access_type: "offline", prompt: "consent", scope: ["openid", "email", ...GOOGLE_CALENDAR_SCOPES].join(" "), state, code_challenge: pkceChallenge(verifier), code_challenge_method: "S256" });
    return GOOGLE_AUTHORIZE_URL + "?" + params.toString();
  },

  async handleGoogleCalendarCallback(query: { code?: string; state?: string; error?: string }) {
    ensureGoogleConfigured();
    if (query.error) {
      if (query.state) await prisma.oAuthIntegrationState.deleteMany({ where: { provider: ConnectedProvider.GOOGLE, stateHash: stateHash(query.state) } });
      throw AppError.badRequest("Google Calendar authorization was cancelled", "GOOGLE_ACCESS_DENIED");
    }
    if (!query.code || !query.state) throw AppError.badRequest("Google authorization response was incomplete", "GOOGLE_CALLBACK_INVALID");
    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: stateHash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.GOOGLE || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) throw AppError.badRequest("Invalid or expired Google authorization state", "GOOGLE_STATE_INVALID");
    const claimed = await prisma.oAuthIntegrationState.updateMany({ where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw AppError.badRequest("Google authorization state has already been used", "GOOGLE_STATE_REPLAYED");
    const verifier = googleDecrypt(oauthState.verifierEnc);
    const token = await googleRequest(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code: query.code, grant_type: "authorization_code", redirect_uri: env.GOOGLE_REDIRECT_URI, code_verifier: verifier }) });
    const profile = await googleRequest(GOOGLE_USERINFO_URL, { headers: { Authorization: "Bearer " + token.access_token } });
    if (!profile.sub) throw AppError.badRequest("Google did not return a stable account identifier", "GOOGLE_PROFILE_INVALID");
    const identity = await prisma.connectedAccount.findFirst({ where: { userId: oauthState.userId, provider: ConnectedProvider.GOOGLE } });
    if (!identity || identity.providerAccountId !== profile.sub) throw AppError.badRequest("The selected Google account does not match the Google identity already connected to MAX", "GOOGLE_ACCOUNT_MISMATCH");
    await prisma.connectedAccount.update({ where: { id: identity.id }, data: { accessTokenEnc: googleEncrypt(token.access_token), refreshTokenEnc: token.refresh_token ? googleEncrypt(token.refresh_token) : identity.refreshTokenEnc, scope: token.scope || ["openid", "email", ...GOOGLE_CALENDAR_SCOPES].join(" "), tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000) } });
    await auditService.record("CONNECTED_ACCOUNT_LINKED", { userId: oauthState.userId, metadata: { provider: "GOOGLE", service: "calendar" } });
    return { status: "connected" as const };
  },

  async googleCalendarRequest(userId: string, path: string, init: RequestInit = {}) {
    ensureGoogleConfigured();
    const account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.GOOGLE } });
    if (!account?.accessTokenEnc) throw AppError.notFound("Google Calendar is not connected");
    const requiredScope = "https://www.googleapis.com/auth/calendar.events";
    if (!account.scope?.split(/\s+/).includes(requiredScope)) throw AppError.badRequest("Google Calendar access has not been granted", "GOOGLE_CALENDAR_SCOPE_REQUIRED");

    let accessToken = googleDecrypt(account.accessTokenEnc);
    if (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
      if (!account.refreshTokenEnc) throw AppError.unauthorized("Google Calendar authorization expired. Please reconnect Google Calendar.", "GOOGLE_REAUTH_REQUIRED");
      const refreshToken = googleDecrypt(account.refreshTokenEnc);
      try {
        const refreshed = await googleRequest(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });
        accessToken = refreshed.access_token;
        await prisma.connectedAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEnc: googleEncrypt(accessToken),
            ...(refreshed.refresh_token ? { refreshTokenEnc: googleEncrypt(refreshed.refresh_token) } : {}),
            tokenExpiresAt: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000),
          },
        });
      } catch (error) {
        if (error instanceof AppError && (error.code === "GOOGLE_REQUEST_FAILED" || /invalid_grant|invalid credentials|unauthorized/i.test(error.message)) && /invalid_grant|invalid credentials|unauthorized/i.test(error.message)) {
          throw AppError.unauthorized("Google Calendar authorization expired. Please reconnect Google Calendar.", "GOOGLE_REAUTH_REQUIRED");
        }
        throw error;
      }
    }

    return googleRequest("https://www.googleapis.com/calendar/v3" + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: "Bearer " + accessToken, Accept: "application/json" },
    });
  },

  async listGoogleCalendars(userId: string) {
    return this.googleCalendarRequest(userId, "/users/me/calendarList");
  },

  async listGoogleCalendarEvents(userId: string, options: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number; pageToken?: string } = {}) {
    const params = new URLSearchParams();
    params.set("singleEvents", "true");
    params.set("orderBy", "startTime");
    if (options.timeMin) params.set("timeMin", options.timeMin);
    if (options.timeMax) params.set("timeMax", options.timeMax);
    if (options.maxResults) params.set("maxResults", String(Math.min(Math.max(options.maxResults, 1), 250)));
    if (options.pageToken) params.set("pageToken", options.pageToken);
    return this.googleCalendarRequest(userId, "/calendars/" + encodeURIComponent(options.calendarId || "primary") + "/events?" + params.toString());
  },

  async getGoogleCalendarEvent(userId: string, eventId: string, calendarId = "primary") {
    if (!eventId.trim()) throw AppError.badRequest("Calendar event ID is required", "GOOGLE_CALENDAR_EVENT_ID_REQUIRED");
    return this.googleCalendarRequest(userId, "/calendars/" + encodeURIComponent(calendarId) + "/events/" + encodeURIComponent(eventId));
  },

  async createGoogleCalendarEvent(userId: string, event: Record<string, unknown>, calendarId = "primary") {
    return this.googleCalendarRequest(userId, "/calendars/" + encodeURIComponent(calendarId) + "/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  },

  async updateGoogleCalendarEvent(userId: string, eventId: string, event: Record<string, unknown>, calendarId = "primary") {
    return this.googleCalendarRequest(userId, "/calendars/" + encodeURIComponent(calendarId) + "/events/" + encodeURIComponent(eventId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  },

  async deleteGoogleCalendarEvent(userId: string, eventId: string, calendarId = "primary") {
    await this.googleCalendarRequest(userId, "/calendars/" + encodeURIComponent(calendarId) + "/events/" + encodeURIComponent(eventId), { method: "DELETE" });
    return { status: "deleted" as const };
  },

  async refreshSpotify(userId: string) {
    ensureConfigured();
    const account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.SPOTIFY } });
    if (!account?.refreshTokenEnc) throw AppError.notFound("Spotify is not connected");
    const refreshToken = decrypt(account.refreshTokenEnc);
    const basic = Buffer.from(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET).toString("base64");
    let token: any;
    try {
      token = await spotifyRequest(SPOTIFY_TOKEN_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basic },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "SPOTIFY_REQUEST_FAILED" && /invalid_grant|invalid refresh token|refresh token/i.test(error.message)) {
        await prisma.connectedAccount.delete({ where: { id: account.id } }).catch(() => undefined);
        await auditService.record("CONNECTED_ACCOUNT_UNLINKED", { userId, metadata: { provider: "SPOTIFY", reason: "refresh_token_invalid" } });
        throw AppError.unauthorized("Your Spotify connection expired. Please connect Spotify again.", "SPOTIFY_REAUTH_REQUIRED");
      }
      throw error;
    }
    return prisma.connectedAccount.update({
      where: { id: account.id },
      data: { accessTokenEnc: encrypt(token.access_token), ...(token.refresh_token ? { refreshTokenEnc: encrypt(token.refresh_token) } : {}), scope: token.scope || account.scope, tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000) },
      select: { id: true, provider: true, scope: true, tokenExpiresAt: true, linkedAt: true, updatedAt: true },
    });
  },
};
