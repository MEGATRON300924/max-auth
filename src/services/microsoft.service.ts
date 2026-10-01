import crypto from "crypto";
import { Request } from "express";
import { prisma } from "../database/prisma";
import { ConnectedProvider } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_URL = "https://graph.microsoft.com/v1.0";
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Files.ReadWrite",
  "Tasks.ReadWrite",
  "Contacts.Read",
];
const STATE_TTL_MS = 10 * 60 * 1000;

function ensureConfigured() {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_REDIRECT_URI || !env.MICROSOFT_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("Microsoft integration is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
}

function key(): Buffer {
  if (!env.MICROSOFT_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("Microsoft integration encryption is not configured", 503, "SERVICE_UNAVAILABLE");
  }
  return crypto.createHash("sha256").update(env.MICROSOFT_TOKEN_ENCRYPTION_KEY).digest();
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new AppError("Invalid encrypted Microsoft credential", 500, "INTERNAL_ERROR");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function randomState() {
  return crypto.randomBytes(32).toString("base64url");
}

function stateHash(state: string) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

async function requestJson(url: string, options: RequestInit): Promise<any> {
  const response = await fetch(url, options);
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error_description || body?.error?.message || body?.error || "Microsoft Graph request failed";
    throw AppError.badRequest(String(message), "MICROSOFT_REQUEST_FAILED", { status: response.status, error: body?.error });
  }
  return body;
}

export const microsoftService = {
  async createAuthorizationUrl(userId: string) {
    ensureConfigured();
    const state = randomState();
    await prisma.oAuthIntegrationState.create({
      data: {
        provider: ConnectedProvider.MICROSOFT,
        stateHash: stateHash(state),
        userId,
        verifierEnc: encrypt("microsoft-oauth"),
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: env.MICROSOFT_REDIRECT_URI,
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
      prompt: "select_account",
    });
    return AUTHORIZE_URL + "?" + params.toString();
  },

  async handleCallback(query: { code?: string; state?: string; error?: string; error_description?: string }, req: Request) {
    ensureConfigured();
    if (query.error) {
      if (query.state) {
        await prisma.oAuthIntegrationState.deleteMany({ where: { provider: ConnectedProvider.MICROSOFT, stateHash: stateHash(query.state) } });
      }
      throw AppError.badRequest(query.error_description || "Microsoft authorization was cancelled", "MICROSOFT_ACCESS_DENIED");
    }
    if (!query.code || !query.state) throw AppError.badRequest("Microsoft authorization response was incomplete", "MICROSOFT_CALLBACK_INVALID");

    const oauthState = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: stateHash(query.state) } });
    if (!oauthState || oauthState.provider !== ConnectedProvider.MICROSOFT || oauthState.usedAt || oauthState.expiresAt.getTime() <= Date.now()) {
      throw AppError.badRequest("Invalid or expired Microsoft authorization state", "MICROSOFT_STATE_INVALID");
    }

    const claimed = await prisma.oAuthIntegrationState.updateMany({
      where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw AppError.badRequest("Microsoft authorization state has already been used", "MICROSOFT_STATE_REPLAYED");

    const token = await requestJson(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        code: query.code,
        redirect_uri: env.MICROSOFT_REDIRECT_URI,
        grant_type: "authorization_code",
        scope: SCOPES.join(" "),
      }),
    });

    if (!token.access_token) throw AppError.badRequest("Microsoft did not return an access token", "MICROSOFT_TOKEN_INVALID");

    const profile = await requestJson(GRAPH_URL + "/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: "Bearer " + token.access_token, Accept: "application/json" },
    });
    if (!profile.id) throw AppError.badRequest("Microsoft did not return a stable account identifier", "MICROSOFT_PROFILE_INVALID");

    const existing = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: ConnectedProvider.MICROSOFT, providerAccountId: profile.id } },
    });
    if (existing && existing.userId !== oauthState.userId) throw AppError.conflict("This Microsoft account is already connected to another MAX Account");

    await prisma.connectedAccount.upsert({
      where: { provider_providerAccountId: { provider: ConnectedProvider.MICROSOFT, providerAccountId: profile.id } },
      create: {
        userId: oauthState.userId,
        provider: ConnectedProvider.MICROSOFT,
        providerAccountId: profile.id,
        accessTokenEnc: encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null,
        scope: token.scope || SCOPES.join(" "),
        tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000),
      },
      update: {
        userId: oauthState.userId,
        accessTokenEnc: encrypt(token.access_token),
        ...(token.refresh_token ? { refreshTokenEnc: encrypt(token.refresh_token) } : {}),
        scope: token.scope || SCOPES.join(" "),
        tokenExpiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000),
      },
    });

    await auditService.record("CONNECTED_ACCOUNT_LINKED", {
      userId: oauthState.userId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { provider: "MICROSOFT", microsoftAccountId: profile.id },
    });
    return { status: "connected" as const };
  },

  async accessToken(userId: string, requiredScopes: string[]) {
    ensureConfigured();
    const account = await prisma.connectedAccount.findFirst({ where: { userId, provider: ConnectedProvider.MICROSOFT } });
    if (!account?.accessTokenEnc) throw AppError.notFound("Microsoft is not connected");

    const granted = new Set((account.scope || "").split(/\s+/).filter(Boolean));
    const missing = requiredScopes.filter((scope) => !granted.has(scope));
    if (missing.length) {
      throw AppError.badRequest("Microsoft access has not been granted for: " + missing.join(", "), "MICROSOFT_SCOPE_REQUIRED", { missingScopes: missing });
    }

    let accessToken = decrypt(account.accessTokenEnc);
    if (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
      if (!account.refreshTokenEnc) throw AppError.unauthorized("Microsoft authorization expired. Please reconnect Microsoft.", "MICROSOFT_REAUTH_REQUIRED");
      const refreshToken = decrypt(account.refreshTokenEnc);
      try {
        const refreshed = await requestJson(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: env.MICROSOFT_CLIENT_ID,
            client_secret: env.MICROSOFT_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope: SCOPES.join(" "),
          }),
        });
        accessToken = refreshed.access_token;
        await prisma.connectedAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEnc: encrypt(accessToken),
            ...(refreshed.refresh_token ? { refreshTokenEnc: encrypt(refreshed.refresh_token) } : {}),
            ...(refreshed.scope ? { scope: refreshed.scope } : {}),
            tokenExpiresAt: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000),
          },
        });
      } catch (error) {
        if (error instanceof AppError && /invalid_grant|invalid credentials|unauthorized/i.test(error.message)) {
          throw AppError.unauthorized("Microsoft authorization expired. Please reconnect Microsoft.", "MICROSOFT_REAUTH_REQUIRED");
        }
        throw error;
      }
    }
    return accessToken;
  },

  async graphRequest(userId: string, path: string, requiredScopes: string[], init: RequestInit = {}) {
    const accessToken = await this.accessToken(userId, requiredScopes);
    return requestJson(GRAPH_URL + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: "Bearer " + accessToken, Accept: "application/json" },
    });
  },

  me(userId: string) {
    return this.graphRequest(userId, "/me?$select=id,displayName,givenName,surname,mail,userPrincipalName,preferredLanguage", ["User.Read"]);
  },

  mail(userId: string, options: { top?: number; search?: string } = {}) {
    const params = new URLSearchParams();
    params.set("$top", String(Math.min(Math.max(options.top || 25, 1), 100)));
    params.set("$select", "id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,webLink");
    if (options.search) params.set("$search", '"' + options.search.replace(/"/g, "") + '"');
    return this.graphRequest(userId, "/me/messages?" + params.toString(), ["Mail.ReadWrite"]);
  },

  calendarEvents(userId: string, options: { startDateTime?: string; endDateTime?: string; top?: number } = {}) {
    const params = new URLSearchParams();
    params.set("$top", String(Math.min(Math.max(options.top || 25, 1), 100)));
    params.set("$orderby", "start/dateTime");
    params.set("$select", "id,subject,start,end,location,organizer,attendees,isAllDay,webLink");
    if (options.startDateTime) params.set("startDateTime", options.startDateTime);
    if (options.endDateTime) params.set("endDateTime", options.endDateTime);
    const path = options.startDateTime || options.endDateTime ? "/me/calendarView?" : "/me/events?";
    return this.graphRequest(userId, path + params.toString(), ["Calendars.ReadWrite"]);
  },

  driveFiles(userId: string, options: { top?: number } = {}) {
    const params = new URLSearchParams({
      "$top": String(Math.min(Math.max(options.top || 25, 1), 100)),
      "$select": "id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference",
    });
    return this.graphRequest(userId, "/me/drive/root/children?" + params.toString(), ["Files.ReadWrite"]);
  },

  todoLists(userId: string) {
    return this.graphRequest(userId, "/me/todo/lists", ["Tasks.ReadWrite"]);
  },

  todoTasks(userId: string, listId: string) {
    if (!listId.trim()) throw AppError.badRequest("Microsoft To Do list ID is required", "MICROSOFT_TODO_LIST_ID_REQUIRED");
    return this.graphRequest(userId, "/me/todo/lists/" + encodeURIComponent(listId) + "/tasks", ["Tasks.ReadWrite"]);
  },

  contacts(userId: string, options: { top?: number } = {}) {
    const params = new URLSearchParams({
      "$top": String(Math.min(Math.max(options.top || 50, 1), 100)),
      "$select": "id,displayName,emailAddresses,businessPhones,mobilePhone,companyName",
    });
    return this.graphRequest(userId, "/me/contacts?" + params.toString(), ["Contacts.Read"]);
  },

  async sendMail(userId: string, message: Record<string, unknown>) {
    return this.graphRequest(userId, "/me/sendMail", ["Mail.Send"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
  },
};
