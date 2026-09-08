import { prisma } from "../database/prisma";
import { hashPassword, verifyPassword } from "../security/password";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";
import jwt from "jsonwebtoken";

export const MAX_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access", "profile:read", "email:read", "account:read"];
const DEFAULT_SCOPES = ["openid", "profile", "email"];
const expiry = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
const days = (value: number) => new Date(Date.now() + value * 24 * 60 * 60 * 1000);

function scopesFor(requested: string[], allowed: string[]) {
  const scopes = requested.length ? requested : DEFAULT_SCOPES;
  const allowedSet = new Set(allowed.length ? allowed : DEFAULT_SCOPES);
  if (scopes.some((scope) => !MAX_OAUTH_SCOPES.includes(scope))) throw AppError.badRequest("One or more requested scopes are invalid", "INVALID_SCOPE");
  if (scopes.some((scope) => !allowedSet.has(scope))) throw AppError.badRequest("One or more requested scopes are not allowed", "INVALID_SCOPE");
  return [...new Set(scopes)];
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
    const scopes = data.scopes ? scopesFor(data.scopes, client.scopes) : client.scopes;
    return prisma.oAuthClient.update({ where: { id }, data: { name: data.name?.trim() || client.name, redirectUris, scopes } });
  },
  async rotateClientSecret(ownerId: string, id: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.ownerId !== ownerId) throw AppError.notFound("OAuth client not found");
    if (!client.isConfidential) throw AppError.badRequest("Public OAuth clients do not use client secrets", "PUBLIC_CLIENT");
    const clientSecret = generateOpaqueToken(32);
    await prisma.oAuthClient.update({ where: { id }, data: { clientSecretHash: await hashPassword(clientSecret) } });
    return { clientId: client.clientId, clientSecret };
  },
  async revokeClient(ownerId: string, id: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.ownerId !== ownerId) throw AppError.notFound("OAuth client not found");
    await prisma.$transaction([prisma.oAuthClient.update({ where: { id }, data: { isActive: false } }), prisma.oAuthAccessToken.updateMany({ where: { clientId: id, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthRefreshToken.updateMany({ where: { clientId: id, revokedAt: id, revokedAt: null }, data: { revokedAt: new Date() } })]);
    return prisma.oAuthClient.findUnique({ where: { id }, select: { id: true, clientId: true, name: true, isActive: true } });
  },
  listConsentsForUser(userId: string) { return prisma.oAuthConsent.findMany({ where: { userId, revokedAt: null }, include: { client: { select: { name: true, clientId: true } } }, orderBy: { grantedAt: "desc" } }); },
  async revokeConsent(userId: string, consentId: string) {
    const consent = await prisma.oAuthConsent.findUnique({ where: { id: consentId } });
    if (!consent || consent.userId !== userId) throw AppError.notFound("Consent record not found");
    await prisma.$transaction([prisma.oAuthConsent.update({ where: { id: consentId }, data: { revokedAt: new Date() } }), prisma.oAuthAccessToken.updateMany({ where: { clientId: consent.clientId, userId, revokedAt: null }, data: { revokedAt: new Date() } }), prisma.oAuthRefreshToken.updateMany({ where: { clientId: consent.clientId, userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
    await auditService.record("OAUTH_CONSENT_REVOKED", { userId, metadata: { clientId: consent.clientId } });
  },
  async getAuthorizationRequest(input: { clientId: string; redirectUri: string; responseType: string; scope?: string; state?: string; codeChallenge?: string; codeChallengeMethod?: string }) {
    if (input.responseType !== "code") throw AppError.badRequest("Only response_type=code is supported", "UNSUPPORTED_RESPONSE_TYPE");
    if (!input.state) throw AppError.badRequest("state is required", "STATE_REQUIRED");
    const client = await loadClient(input.clientId);
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (!input.codeChallenge || input.codeChallengeMethod !== "S256") throw AppError.badRequest("S256 PKCE is required", "PKCE_REQUIRED");
    if (input.codeChallenge.length < 43 || input.codeChallenge.length > 128) throw AppError.badRequest("Invalid PKCE challenge", "INVALID_REQUEST");
    return { client, scopes: scopesFor((input.scope ?? "").split(" ").filter(Boolean), client.scopes) };
  },
  async issueAuthorizationCode(input: { clientId: string; userId: string; redirectUri: string; scopes: string[]; codeChallenge?: string; codeChallengeMethod?: string }) {
    const client = await loadClient(input.clientId);
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (!input.codeChallenge || input.codeChallengeMethod !== "S256") throw AppError.badRequest("S256 PKCE is required", "PKCE_REQUIRED");
    const scopes = scopesFor(input.scopes, client.scopes);
    const rawCode = generateOpaqueToken(48);
    await prisma.oAuthAuthorizationCode.create({ data: { codeHash: hashToken(rawCode), clientId: client.id, userId: input.userId, redirectUri: input.redirectUri, scopes, codeChallenge: input.codeChallenge, codeChallengeMethod: input.codeChallengeMethod, expiresAt: expiry(env.OAUTH_AUTH_CODE_TTL_MINUTES) } });
    await prisma.oAuthConsent.upsert({ where: { clientId_userId: { clientId: client.id, userId: input.userId } }, create: { clientId: client.id, userId: input.userId, scopes }, update: { scopes, grantedAt: new Date(), revokedAt: null } });
    await auditService.record("OAUTH_CONSENT_GRANTED", { userId: input.userId, metadata: { clientId: client.clientId, scopes } });
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
    await prisma.oAuthAuthorizationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    const accessToken = generateOpaqueToken(48); const refreshToken = generateOpaqueToken(48);
    await prisma.$transaction([prisma.oAuthAccessToken.create({ data: { tokenHash: hashToken(accessToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: expiry(env.OAUTH_ACCESS_TOKEN_TTL_MINUTES) } }), prisma.oAuthRefreshToken.create({ data: { tokenHash: hashToken(refreshToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: days(env.OAUTH_REFRESH_TOKEN_TTL_DAYS) } })]);
    return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: env.OAUTH_ACCESS_TOKEN_TTL_MINUTES * 60, scope: record.scopes.join(" "), ...(record.scopes.includes("openid") ? { id_token: signIdToken(user, client.clientId) } : {}) };
  },
  async refreshAccessToken(rawRefreshToken: string, clientId: string, clientSecret?: string) {
    const client = await loadClient(clientId);
    if (client.isConfidential && (!clientSecret || !(await verifyPassword(client.clientSecretHash, clientSecret)))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT");
    const token = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hashToken(rawRefreshToken) } });
    if (!token || token.clientId !== client.id || token.revokedAt || token.expiresAt < new Date()) throw AppError.unauthorized("Invalid or expired refresh token", "INVALID_GRANT");
    const newAccess = generateOpaqueToken(48); const newRefresh = generateOpaqueToken(48);
    await prisma.$transaction([prisma.oAuthRefreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } }), prisma.oAuthAccessToken.create({ data: { tokenHash: hashToken(newAccess), clientId: client.id, userId: token.userId, scopes: token.scopes, expiresAt: expiry(env.OAUTH_ACCESS_TOKEN_TTL_MINUTES) } }), prisma.oAuthRefreshToken.create({ data: { tokenHash: hashToken(newRefresh), clientId: client.id, userId: token.userId, scopes: token.scopes, expiresAt: days(env.OAUTH_REFRESH_TOKEN_TTL_DAYS) } })]);
    return { access_token: newAccess, refresh_token: newRefresh, token_type: "Bearer", expires_in: env.OAUTH_ACCESS_TOKEN_TTL_MINUTES * 60, scope: token.scopes.join(" ") };
  },
  async revokeToken(rawToken: string, clientId: string, clientSecret?: string) {
    const client = await loadClient(clientId);
    if (client.isConfidential && (!clientSecret || !(await verifyPassword(client.clientSecretHash, clientSecret)))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT");
    const hash = hashToken(rawToken);
    await prisma.oAuthAccessToken.updateMany({ where: { tokenHash: hash, clientId: client.id }, data: { revokedAt: new Date() } });
    await prisma.oAuthRefreshToken.updateMany({ where: { tokenHash: hash, clientId: client.id }, data: { revokedAt: new Date() } });
  },
  async introspect(rawToken: string) {
    const token = await prisma.oAuthAccessToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: { select: { id: true, username: true, displayName: true, email: true, avatarUrl: true, verificationStatus: true, subscriptionTier: true, status: true } }, client: { select: { clientId: true } } } });
    if (!token || token.revokedAt || token.expiresAt < new Date() || token.user.status !== "ACTIVE") return { active: false as const };
    return { active: true as const, user: token.user, clientId: token.client.clientId, scopes: token.scopes, expiresAt: token.expiresAt };
  },
};
