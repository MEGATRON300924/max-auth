import { prisma } from "../database/prisma";
import { hashPassword, verifyPassword } from "../security/password";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";
import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "crypto";

export const MAX_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access", "profile:read", "email:read", "account:read", "identity:read", "memory:read"];
const DEFAULT_SCOPES = ["openid", "profile", "email"];
const expiry = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
const days = (value: number) => new Date(Date.now() + value * 24 * 60 * 60 * 1000);

type AuthorizationRequest = {
  clientId: string;
  clientName: string;
  clientLogo?: string;
  clientWebsite?: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: "S256";
  state: string;
  exp: number;
};

function scopesFor(requested: string[], allowed: string[]) {
  const scopes = requested.length ? requested : DEFAULT_SCOPES;
  const allowedSet = new Set(allowed.length ? allowed : DEFAULT_SCOPES);
  if (scopes.some((scope) => !MAX_OAUTH_SCOPES.includes(scope))) throw AppError.badRequest("One or more requested scopes are invalid", "INVALID_SCOPE");
  if (scopes.some((scope) => !allowedSet.has(scope))) throw AppError.badRequest("One or more requested scopes are not allowed", "INVALID_SCOPE");
  return [...new Set(scopes)];
}

function signAuthorizationRequest(request: Omit<AuthorizationRequest, "exp">) {
  const payload: AuthorizationRequest = { ...request, exp: Math.floor(Date.now() / 1000) + env.OAUTH_AUTH_CODE_TTL_MINUTES * 60 };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.JWT_ACCESS_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyAuthorizationRequest(raw: string): AuthorizationRequest {
  const [encoded, signature] = String(raw || "").split(".");
  if (!encoded || !signature) throw AppError.badRequest("Invalid authorization request", "INVALID_REQUEST");
  const expected = createHmac("sha256", env.JWT_ACCESS_SECRET).update(encoded).digest("base64url");
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) throw AppError.badRequest("Invalid authorization request", "INVALID_REQUEST");
  let payload: AuthorizationRequest;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw AppError.badRequest("Invalid authorization request", "INVALID_REQUEST"); }
  if (!payload?.clientId || !payload?.clientName || !payload?.redirectUri || !Array.isArray(payload.scopes) || !payload?.codeChallenge || payload.codeChallengeMethod !== "S256" || !payload?.state || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) throw AppError.badRequest("Authorization request expired or invalid", "INVALID_REQUEST");
  return payload;
}

function signIdToken(user: { id: string; email: string; username: string; displayName: string | null; avatarUrl: string | null; verificationStatus: string }, clientId: string) {
  if (!env.OIDC_PRIVATE_KEY) throw new AppError("MAX Auth OIDC signing is not configured", 503, "OIDC_NOT_CONFIGURED");
  return jwt.sign({ iss: env.OIDC_ISSUER, sub: user.id, aud: clientId, email: user.email, email_verified: user.verificationStatus === "VERIFIED", preferred_username: user.username, name: user.displayName, picture: user.avatarUrl }, env.OIDC_PRIVATE_KEY.replace(/\\n/g, "\n"), { algorithm: "RS256", expiresIn: env.OIDC_ID_TOKEN_TTL_SECONDS, issuer: env.OIDC_ISSUER, audience: clientId, keyid: env.OIDC_KEY_ID } as jwt.SignOptions);
}

async function loadClient(clientId: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client || !client.isActive) throw AppError.unauthorized("Invalid OAuth client", "INVALID_CLIENT");
  return client;
}

export const oauthService = {
  async createClient(ownerId: string, data: { name: string; redirectUris: string[]; scopes: string[]; isConfidential?: boolean }) {
    if (!data.name?.trim()) throw AppError.badRequest("Application name is required", "INVALID_CLIENT_METADATA");
    const scopes = scopesFor(data.scopes, MAX_OAUTH_SCOPES);
    const redirectUris = [...new Set(data.redirectUris.map((uri) => new URL(uri).toString()))];
    if (redirectUris.some((uri) => uri.startsWith("http://") && !uri.startsWith("http://localhost") && !uri.startsWith("http://127.0.0.1"))) throw AppError.badRequest("Production redirect URIs must use HTTPS", "INVALID_REDIRECT_URI");
    const clientId = `max_client_${generateOpaqueToken(12)}`;
    const clientSecret = generateOpaqueToken(32);
    const client = await prisma.oAuthClient.create({ data: { clientId, clientSecretHash: await hashPassword(clientSecret), name: data.name.trim(), ownerId, redirectUris, scopes, isConfidential: data.isConfidential ?? false } });
    await auditService.record("OAUTH_CLIENT_CREATED", { userId: ownerId, metadata: { clientId, name: client.name, isConfidential: client.isConfidential } });
    return { client, clientSecret: client.isConfidential ? clientSecret : undefined };
  },
  listClientsForOwner(ownerId: string) { return prisma.oAuthClient.findMany({ where: { ownerId }, select: { id: true, clientId: true, name: true, redirectUris: true, scopes: true, isConfidential: true, isActive: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" } }); },
  async updateClient(ownerId: string, id: string, data: { name?: string; redirectUris?: string[]; scopes?: string[] }) {
    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.ownerId !== ownerId) throw AppError.notFound("OAuth client not found");
    const redirectUris = data.redirectUris ? [...new Set(data.redirectUris.map((uri) => new URL(uri).toString()))] : client.redirectUris;
    if (redirectUris.some((uri) => uri.startsWith("http://") && !uri.startsWith("http://localhost") && !uri.startsWith("http://127.0.0.1"))) throw AppError.badRequest("Production redirect URIs must use HTTPS", "INVALID_REDIRECT_URI");
    const scopes = data.scopes ? scopesFor(data.scopes, MAX_OAUTH_SCOPES) : client.scopes;
    const redirectUrisChanged = JSON.stringify(redirectUris) !== JSON.stringify(client.redirectUris);
    const scopesChanged = JSON.stringify([...scopes].sort()) !== JSON.stringify([...client.scopes].sort());
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.oAuthClient.update({ where: { id }, data: { name: data.name?.trim() || client.name, redirectUris, scopes } });
      if (redirectUrisChanged || scopesChanged) {
        await tx.oAuthAuthorizationCode.deleteMany({ where: { clientId: id } });
        await tx.oAuthAccessToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.oAuthRefreshToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.oAuthConsent.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return result;
    });
    if (redirectUrisChanged || scopesChanged) await auditService.record("OAUTH_CLIENT_UPDATED", { userId: ownerId, metadata: { clientId: client.clientId, invalidatedAuthorizations: true } });
    return updated;
  },
  async rotateClientSecret(ownerId: string, id: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.ownerId !== ownerId) throw AppError.notFound("OAuth client not found");
    if (!client.isConfidential) throw AppError.badRequest("Public OAuth clients do not use client secrets", "PUBLIC_CLIENT");
    const clientSecret = generateOpaqueToken(32);
    await prisma.oAuthClient.update({ where: { id }, data: { clientSecretHash: await hashPassword(clientSecret) } });
    await auditService.record("OAUTH_CLIENT_SECRET_ROTATED", { userId: ownerId, metadata: { clientId: client.clientId } });
    return { clientId: client.clientId, clientSecret };
  },
  async revokeClient(ownerId: string, id: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.ownerId !== ownerId) throw AppError.notFound("OAuth client not found");
    await prisma.$transaction([prisma.oAuthClient.update({ where: { id }, data: { isActive: false } }), prisma.oAuthAccessToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthRefreshToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthAuthorizationCode.deleteMany({ where: { clientId: id } })]);
    return prisma.oAuthClient.findUnique({ where: { id }, select: { id: true, clientId: true, name: true, isActive: true } });
  },
  listConsentsForUser(userId: string) { return prisma.oAuthConsent.findMany({ where: { userId, revokedAt: null }, include: { client: { select: { name: true, clientId: true } } }, orderBy: { grantedAt: "desc" } }); },
  async revokeConsent(userId: string, consentId: string) {
    const consent = await prisma.oAuthConsent.findUnique({ where: { id: consentId } });
    if (!consent || consent.userId !== userId) throw AppError.notFound("Consent record not found");
    await prisma.$transaction([prisma.oAuthConsent.update({ where: { id: consentId }, data: { revokedAt: new Date() } }), prisma.oAuthAccessToken.updateMany({ where: { clientId: consent.clientId, userId, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthRefreshToken.updateMany({ where: { clientId: consent.clientId, userId, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthAuthorizationCode.deleteMany({ where: { clientId: consent.clientId, userId } })]);
    await auditService.record("OAUTH_CONSENT_REVOKED", { userId, metadata: { clientId: consent.clientId } });
  },
  async getAuthorizationRequest(input: { clientId: string; redirectUri: string; responseType: string; scope?: string; state?: string; codeChallenge?: string; codeChallengeMethod?: string; branding?: { name?: string; logo?: string; website?: string } }) {
    if (input.responseType !== "code") throw AppError.badRequest("Only response_type=code is supported", "UNSUPPORTED_RESPONSE_TYPE");
    if (!input.state) throw AppError.badRequest("state is required", "STATE_REQUIRED");
    const client = await loadClient(input.clientId);
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (!input.codeChallenge || input.codeChallengeMethod !== "S256") throw AppError.badRequest("S256 PKCE is required", "PKCE_REQUIRED");
    if (input.codeChallenge.length < 43 || input.codeChallenge.length > 128) throw AppError.badRequest("Invalid PKCE challenge", "INVALID_REQUEST");
    const scopes = scopesFor((input.scope ?? "").split(" ").filter(Boolean), client.scopes);
    const clientName = input.branding?.name?.trim() || client.name;
    const requestToken = signAuthorizationRequest({ clientId: client.clientId, clientName, clientLogo: input.branding?.logo, clientWebsite: input.branding?.website, redirectUri: input.redirectUri, scopes, codeChallenge: input.codeChallenge, codeChallengeMethod: "S256", state: input.state });
    return { client, scopes, requestToken };
  },
  async issueAuthorizationCode(input: { clientId: string; userId: string; redirectUri: string; scopes: string[]; codeChallenge?: string; codeChallengeMethod?: string; state?: string; requestToken?: string }) {
    const client = await loadClient(input.clientId);
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (!input.codeChallenge || input.codeChallengeMethod !== "S256") throw AppError.badRequest("S256 PKCE is required", "PKCE_REQUIRED");
    if (!input.requestToken) throw AppError.badRequest("Authorization request is required", "INVALID_REQUEST");
    const request = verifyAuthorizationRequest(input.requestToken);
    if (request.clientId !== client.clientId || request.redirectUri !== input.redirectUri || request.codeChallenge !== input.codeChallenge || request.codeChallengeMethod !== input.codeChallengeMethod || request.state !== input.state) throw AppError.badRequest("Authorization request does not match", "INVALID_REQUEST");
    const scopes = scopesFor(request.scopes, client.scopes);
    if (JSON.stringify(scopes) !== JSON.stringify([...new Set(input.scopes)])) throw AppError.badRequest("Approved permissions do not match the authorization request", "INVALID_SCOPE");
    const rawCode = generateOpaqueToken(48);
    const existingConsent = await prisma.oAuthConsent.findUnique({ where: { clientId_userId: { clientId: client.id, userId: input.userId } } });
    const previousScopes = existingConsent?.revokedAt ? [] : (existingConsent?.scopes ?? []);
    const scopeReduction = previousScopes.some((scope) => !new Set(scopes).has(scope));
    await prisma.$transaction(async (tx) => {
      if (scopeReduction) {
        const revokedAt = new Date();
        await tx.oAuthAccessToken.updateMany({ where: { clientId: client.id, userId: input.userId, revokedAt: null }, data: { revokedAt } });
        await tx.oAuthRefreshToken.updateMany({ where: { clientId: client.id, userId: input.userId, revokedAt: null }, data: { revokedAt } });
        await tx.oAuthAuthorizationCode.deleteMany({ where: { clientId: client.id, userId: input.userId } });
      }
      await tx.oAuthAuthorizationCode.create({ data: { codeHash: hashToken(rawCode), clientId: client.id, userId: input.userId, redirectUri: input.redirectUri, scopes, codeChallenge: input.codeChallenge, codeChallengeMethod: input.codeChallengeMethod, expiresAt: expiry(env.OAUTH_AUTH_CODE_TTL_MINUTES) } });
      await tx.oAuthConsent.upsert({ where: { clientId_userId: { clientId: client.id, userId: input.userId } }, create: { clientId: client.id, userId: input.userId, scopes }, update: { scopes, grantedAt: new Date(), revokedAt: null } });
    });
    await auditService.record("OAUTH_CONSENT_GRANTED", { userId: input.userId, metadata: { clientId: client.clientId, scopes, previousScopes, scopeReduction } });
    return rawCode;
  },
  async exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier?: string; clientSecret?: string }) {
    const client = await loadClient(input.clientId);
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (client.isConfidential && (!input.clientSecret || !(await verifyPassword(client.clientSecretHash, input.clientSecret)))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT");
    const record = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hashToken(input.code) } });
    if (!record || record.clientId !== client.id || record.usedAt || record.expiresAt < new Date() || record.redirectUri !== input.redirectUri) throw AppError.badRequest("Invalid or expired authorization code", "INVALID_GRANT");
    if (!input.codeVerifier) throw AppError.badRequest("PKCE verifier required", "PKCE_REQUIRED");
    const crypto = await import("crypto");
    const digest = crypto.createHash("sha256").update(input.codeVerifier).digest("base64url");
    if (digest !== record.codeChallenge) throw AppError.badRequest("Invalid PKCE verifier", "INVALID_GRANT");
    const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true, email: true, username: true, displayName: true, avatarUrl: true, verificationStatus: true, status: true } });
    if (!user || user.status !== "ACTIVE") throw AppError.unauthorized("Account is not active", "ACCOUNT_INACTIVE");
    const now = new Date();
    const accessToken = generateOpaqueToken(48);
    const shouldIssueRefreshToken = record.scopes.includes("offline_access");
    const refreshToken = shouldIssueRefreshToken ? generateOpaqueToken(48) : undefined;
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.oAuthAuthorizationCode.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw AppError.badRequest("Authorization code has already been used", "INVALID_GRANT");
      await tx.oAuthAccessToken.create({ data: { tokenHash: hashToken(accessToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: expiry(env.OAUTH_ACCESS_TOKEN_TTL_MINUTES) } });
      if (refreshToken) await tx.oAuthRefreshToken.create({ data: { tokenHash: hashToken(refreshToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: days(env.OAUTH_REFRESH_TOKEN_TTL_DAYS) } });
      return { accessToken, refreshToken };
    });
    return { token_type: "Bearer", access_token: result.accessToken, expires_in: env.OAUTH_ACCESS_TOKEN_TTL_MINUTES * 60, scope: record.scopes.join(" "), ...(result.refreshToken ? { refresh_token: result.refreshToken } : {}), ...(record.scopes.includes("openid") ? { id_token: signIdToken(user, client.clientId) } : {}) };
  },
  async refreshAccessToken(refreshToken: string, clientId: string, clientSecret?: string) {
    const client = await loadClient(clientId);
    if (client.isConfidential && (!clientSecret || !(await verifyPassword(client.clientSecretHash, clientSecret)))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT");
    const tokenHash = hashToken(refreshToken || "");
    const record = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.clientId !== client.id) throw AppError.badRequest("Invalid refresh token", "INVALID_GRANT");
    if (record.revokedAt) {
      await prisma.$transaction([prisma.oAuthAccessToken.updateMany({ where: { clientId: client.id, userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthRefreshToken.updateMany({ where: { clientId: client.id, userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
      throw AppError.badRequest("Refresh token reuse detected", "INVALID_GRANT");
    }
    if (record.expiresAt < new Date()) throw AppError.badRequest("Refresh token expired", "INVALID_GRANT");
    const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") throw AppError.unauthorized("Account is not active", "ACCOUNT_INACTIVE");
    const newAccessToken = generateOpaqueToken(48);
    const newRefreshToken = generateOpaqueToken(48);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.oAuthRefreshToken.updateMany({ where: { id: record.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (claimed.count !== 1) throw AppError.badRequest("Refresh token has already been used", "INVALID_GRANT");
      await tx.oAuthAccessToken.create({ data: { tokenHash: hashToken(newAccessToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: expiry(env.OAUTH_ACCESS_TOKEN_TTL_MINUTES) } });
      await tx.oAuthRefreshToken.create({ data: { tokenHash: hashToken(newRefreshToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: record.expiresAt } });
    });
    return { token_type: "Bearer", access_token: newAccessToken, expires_in: env.OAUTH_ACCESS_TOKEN_TTL_MINUTES * 60, refresh_token: newRefreshToken, scope: record.scopes.join(" ") };
  },
  async revokeToken(token: string, clientId: string, clientSecret?: string) {
    const client = await loadClient(clientId);
    if (client.isConfidential && (!clientSecret || !(await verifyPassword(client.clientSecretHash, clientSecret)))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT");
    const hash = hashToken(token || "");
    await prisma.$transaction([prisma.oAuthAccessToken.updateMany({ where: { tokenHash: hash, clientId: client.id, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthRefreshToken.updateMany({ where: { tokenHash: hash, clientId: client.id, revokedAt: null }, data: { revokedAt: new Date() } })]);
  },
  async introspect(token: string) {
    const hash = hashToken(token || "");
    const record = await prisma.oAuthAccessToken.findUnique({ where: { tokenHash: hash }, include: { user: { select: { id: true, email: true, username: true, displayName: true, avatarUrl: true, verificationStatus: true, status: true } }, client: { select: { clientId: true } } } });
    if (!record || record.revokedAt || record.expiresAt < new Date() || record.user.status !== "ACTIVE") return { active: false };
    return { active: true, client_id: record.client.clientId, user: record.user, scopes: record.scopes, exp: Math.floor(record.expiresAt.getTime() / 1000) };
  },
};