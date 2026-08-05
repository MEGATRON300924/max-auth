import { prisma } from "../database/prisma";
import { ConnectedProvider } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";

/**
 * NOTE: This service only prepares the data layer for linking third-party
 * accounts (Google, X, Instagram, Snapchat, Spotify, Discord, GitHub).
 * The actual OAuth handshake with each provider is NOT implemented yet —
 * this exposes CRUD around already-obtained tokens so the integration
 * layer can be dropped in later without schema changes.
 */
export const connectedAccountsService = {
  list(userId: string) {
    return prisma.connectedAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        scope: true,
        linkedAt: true,
        updatedAt: true,
        // token fields intentionally excluded from API responses
      },
    });
  },

  async link(
    userId: string,
    provider: ConnectedProvider,
    data: {
      providerAccountId: string;
      accessTokenEnc?: string;
      refreshTokenEnc?: string;
      scope?: string;
      tokenExpiresAt?: Date;
    },
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const account = await prisma.connectedAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: data.providerAccountId,
        },
      },
      create: { userId, provider, ...data },
      update: { ...data },
    });

    await auditService.record("CONNECTED_ACCOUNT_LINKED", {
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { provider },
    });

    return account;
  },

  async unlink(
    userId: string,
    connectedAccountId: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: connectedAccountId },
    });
    if (!account || account.userId !== userId) {
      throw AppError.notFound("Connected account not found");
    }

    await prisma.connectedAccount.delete({ where: { id: connectedAccountId } });

    await auditService.record("CONNECTED_ACCOUNT_UNLINKED", {
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { provider: account.provider },
    });
  },
};
