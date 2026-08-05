import { prisma } from "../database/prisma";
import { hashPassword } from "../security/password";
import { generateOpaqueToken } from "../security/tokens";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";

/**
 * "Continue with MAX AI" — OAuth 2.0 provider architecture.
 *
 * This module only prepares the data layer + client management APIs
 * (register OAuth clients, store redirect URIs/scopes, list consents).
 *
 * The actual /authorize and /token grant flows (authorization code exchange,
 * PKCE verification, consent screen, token issuance) are intentionally
 * NOT implemented yet, per spec. Their route stubs exist and return 501
 * so the frontend/mobile team can integrate against stable paths later.
 */
export const oauthService = {
  async createClient(
    ownerId: string,
    data: { name: string; redirectUris: string[]; scopes: string[]; isConfidential?: boolean }
  ) {
    const clientId = `max_client_${generateOpaqueToken(12)}`;
    const clientSecret = generateOpaqueToken(32);
    const clientSecretHash = await hashPassword(clientSecret);

    const client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash,
        name: data.name,
        ownerId,
        redirectUris: data.redirectUris,
        scopes: data.scopes,
        isConfidential: data.isConfidential ?? true,
      },
    });

    await auditService.record("OAUTH_CLIENT_CREATED", {
      userId: ownerId,
      metadata: { clientId: client.clientId, name: client.name },
    });

    // clientSecret is only ever returned once, at creation time.
    return { client, clientSecret };
  },

  listClientsForOwner(ownerId: string) {
    return prisma.oAuthClient.findMany({
      where: { ownerId },
      select: {
        id: true,
        clientId: true,
        name: true,
        redirectUris: true,
        scopes: true,
        isConfidential: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  async revokeClient(ownerId: string, clientId: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
    if (!client || client.ownerId !== ownerId) {
      throw AppError.notFound("OAuth client not found");
    }
    return prisma.oAuthClient.update({
      where: { id: clientId },
      data: { isActive: false },
    });
  },

  listConsentsForUser(userId: string) {
    return prisma.oAuthConsent.findMany({
      where: { userId, revokedAt: null },
      include: { client: { select: { name: true, clientId: true } } },
    });
  },

  async revokeConsent(userId: string, consentId: string) {
    const consent = await prisma.oAuthConsent.findUnique({ where: { id: consentId } });
    if (!consent || consent.userId !== userId) {
      throw AppError.notFound("Consent record not found");
    }
    await prisma.oAuthConsent.update({
      where: { id: consentId },
      data: { revokedAt: new Date() },
    });
    await auditService.record("OAUTH_CONSENT_REVOKED", { userId });
  },
};
