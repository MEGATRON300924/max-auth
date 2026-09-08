import { prisma } from "../database/prisma";
import { hashPassword, verifyPassword } from "../security/password";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const DEFAULT_SCOPES = ["profile:read", "email:read"];
const expiry = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
const days = (value: number) => new Date(Date.now() + value * 24 * 60 * 60 * 1000);

function scopesFor(requested: string[], allowed: string[]) {
  const scopes = requested.length ? requested : DEFAULT_SCOPES;
  const allowedSet = new Set(allowed.length ? allowed : DEFAULT_SCOPES);
  if (scopes.some((scope) => !allowedSet.has(scope))) throw AppError.badRequest("One or more requested scopes are not allowed", "INVALID_SCOPE");
  return [...new Set(scopes)];
}

export const oauthService = {
  async createClient(ownerId: string, data: { name: string; redirectUris: string[]; scopes: string[]; isConfidential?: boolean }) {
    const clientId = `max_client_${generateOpaqueToken(12)}`;
    const clientSecret = generateOpaqueToken(32);
    const client = await prisma.oAuthClient.create({ data: { clientId, clientSecretHash: await hashPassword(clientSecret), name: data.name, ownerId, redirectUris: data.redirectUris, scopes: data.scopes, isConfidential: data.isConfidential ?? true } });
    await auditService.record("OAUTH_CLIENT_CREATED", { userId: ownerId, metadata: { clientId, name: client.name } });
    return { client, clientSecret };
  },
  listClientsForOwner(ownerId: string) { return prisma.oAuthClient.findMany({ where: { ownerId }, select: { id: true, clientId: true, name: true, redirectUris: true, scopes: true, isConfidential: true, isActive: true, createdAt: true } }); },
  async revokeClient(ownerId: string, id: string) { const client = await prisma.oAuthClient.findUnique({ where: { id } }); if (!client || client.ownerId !== ownerId) throw AppError.notFound("OAuth client not found"); return prisma.oAuthClient.update({ where: { id }, data: { isActive: false } }); },
  listConsentsForUser(userId: string) { return prisma.oAuthConsent.findMany({ where: { userId, revokedAt: null }, include: { client: { select: { name: true, clientId: true } } } }); },
  async revokeConsent(userId: string, consentId: string) { const consent = await prisma.oAuthConsent.findUnique({ where: { id: consentId } }); if (!consent || consent.userId !== userId) throw AppError.notFound("Consent record not found"); await prisma.oAuthConsent.update({ where: { id: consentId }, data: { revokedAt: new Date() } }); await auditService.record("OAUTH_CONSENT_REVOKED", { userId }); },

  async getAuthorizationRequest(input: { clientId: string; redirectUri: string; responseType: string; scope?: string; state?: string; codeChallenge?: string; codeChallengeMethod?: string }) {
    if (input.responseType !== "code") throw AppError.badRequest("Only response_type=code is supported", "UNSUPPORTED_RESPONSE_TYPE");
    const client = await prisma.oAuthClient.findUnique({ where: { clientId: input.clientId } });
    if (!client || !client.isActive) throw AppError.badRequest("Unknown or inactive OAuth client", "INVALID_CLIENT");
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (input.codeChallengeMethod && input.codeChallengeMethod !== "S256") throw AppError.badRequest("Only S256 PKCE is supported", "UNSUPPORTED_CODE_CHALLENGE");
    if (client.isConfidential && !input.codeChallenge) throw AppError.badRequest("PKCE is required", "PKCE_REQUIRED");
    return { client, scopes: scopesFor((input.scope ?? "").split(" ").filter(Boolean), client.scopes) };
  },

  async issueAuthorizationCode(input: { clientId: string; userId: string; redirectUri: string; scopes: string[]; codeChallenge?: string; codeChallengeMethod?: string }) {
    const client = await prisma.oAuthClient.findUnique({ where: { clientId: input.clientId } });
    if (!client || !client.isActive) throw AppError.badRequest("Invalid client", "INVALID_CLIENT");
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (client.isConfidential && !input.codeChallenge) throw AppError.badRequest("PKCE is required", "PKCE_REQUIRED");
    const scopes = scopesFor(input.scopes, client.scopes);
    const rawCode = generateOpaqueToken(48);
    await prisma.oAuthAuthorizationCode.create({ data: { codeHash: hashToken(rawCode), clientId: client.id, userId: input.userId, redirectUri: input.redirectUri, scopes, codeChallenge: input.codeChallenge, codeChallengeMethod: input.codeChallengeMethod, expiresAt: expiry(env.OAUTH_AUTH_CODE_TTL_MINUTES) } });
    await prisma.oAuthConsent.upsert({ where: { clientId_userId: { clientId: client.id, userId: input.userId } }, create: { clientId: client.id, userId: input.userId, scopes }, update: { scopes, grantedAt: new Date(), revokedAt: null } });
    await auditService.record("OAUTH_CONSENT_GRANTED", { userId: input.userId, metadata: { clientId: client.clientId, scopes } });
    return rawCode;
  },

  async exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier?: string; clientSecret?: string }) {
    const client = await prisma.oAuthClient.findUnique({ where: { clientId: input.clientId } });
    if (!client || !client.isActive) throw AppError.unauthorized("Invalid OAuth client", "INVALID_CLIENT");
    if (!client.redirectUris.includes(input.redirectUri)) throw AppError.badRequest("Invalid redirect URI", "INVALID_REDIRECT_URI");
    if (client.isConfidential) { if (!input.clientSecret || !(await verifyPassword(client.clientSecretHash, input.clientSecret))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT"); }
    const record = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hashToken(input.code) } });
    if (!record || record.clientId !== client.id || record.usedAt || record.expiresAt < new Date() || record.redirectUri !== input.redirectUri) throw AppError.badRequest("Invalid or expired authorization code", "INVALID_GRANT");
    if (record.codeChallenge) { if (!input.codeVerifier) throw AppError.badRequest("PKCE verifier required", "PKCE_REQUIRED"); const crypto = await import("crypto"); const digest = crypto.createHash("sha256").update(input.codeVerifier).digest("base64url"); if (digest !== record.codeChallenge) throw AppError.badRequest("Invalid PKCE verifier", "INVALID_GRANT"); }
    await prisma.oAuthAuthorizationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    const accessToken = generateOpaqueToken(48); const refreshToken = generateOpaqueToken(48);
    await prisma.$transaction([
      prisma.oAuthAccessToken.create({ data: { tokenHash: hashToken(accessToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: expiry(env.OAUTH_ACCESS_TOKEN_TTL_MINUTES) } }),
      prisma.oAuthRefreshToken.create({ data: { tokenHash: hashToken(refreshToken), clientId: client.id, userId: record.userId, scopes: record.scopes, expiresAt: days(env.OAUTH_REFRESH_TOKEN_TTL_DAYS) } }),
    ]);
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: env.OAUTH_ACCESS_TOKEN_TTL_MINUTES * 60, scopes: record.scopes };
  },

  async refreshAccessToken(rawRefreshToken: string, clientId: string, clientSecret?: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client || !client.isActive) throw AppError.unauthorized("Invalid OAuth client", "INVALID_CLIENT");
    if (client.isConfidential) { if (!clientSecret || !(await verifyPassword(client.clientSecretHash, clientSecret))) throw AppError.unauthorized("Invalid client credentials", "INVALID_CLIENT"); }
    const token = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hashToken(rawRefreshToken) } });
    if (!token || token.clientId !== client.id || token.revokedAt || token.expiresAt < new Date()) throw AppError.unauthorized("Invalid or expired refresh token", "INVALID_GRANT");
    const newAccess = generateOpaqueToken(48); const newRefresh = generateOpaqueToken(48);
    await prisma.$transaction([
      prisma.oAuthRefreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } }),
      prisma.oAuthAccessToken.create({ data: { tokenHash: hashToken(newAccess), clientId: client.id, userId: token.userId, scopes: token.scopes, expiresAt: expiry(env.OAUTH_ACCESS_TOKEN_TTL_MINUTES) } }),
      prisma.oAuthRefreshToken.create({ data: { tokenHash: hashToken(newRefresh), clientId: client.id, userId: token.userId, scopes: token.scopes, expiresAt: days(env.OAUTH_REFRESH_TOKEN_TTL_DAYS) } }),
    ]);
    return { accessToken: newAccess, refreshToken: newRefresh, tokenType: "Bearer", expiresIn: env.OAUTH_ACCESS_TOKEN_TTL_MINUTES * 60, scopes: token.scopes };
  },

  async introspect(rawToken: string) {
    const token = await prisma.oAuthAccessToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: { select: { id: true, username: true, displayName: true, email: true, avatarUrl: true, verificationStatus: true, subscriptionTier: true, status: true } }, client: { select: { clientId: true } } } });
    if (!token || token.revokedAt || token.expiresAt < new Date() || token.user.status !== "ACTIVE") return { active: false as const };
    return { active: true as const, user: token.user, clientId: token.client.clientId, scopes: token.scopes, expiresAt: token.expiresAt };
  },
};
