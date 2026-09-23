import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const PERSONALIZATION_VERSION = 1;

function parseJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitizeConnectedServices(accounts: Array<{
  provider: string;
  scope: string | null;
  tokenExpiresAt: Date | null;
  linkedAt: Date;
  updatedAt: Date;
}>) {
  return accounts.map((account) => ({
    provider: account.provider,
    connected: true,
    scopes: (account.scope || "").split(/\s+/).filter(Boolean),
    tokenExpiresAt: account.tokenExpiresAt?.toISOString() || null,
    linkedAt: account.linkedAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }));
}

export const personalizationService = {
  async getSnapshot(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        language: true,
        timezone: true,
        subscriptionTier: true,
        aiProfile: {
          select: {
            interests: true,
            preferences: true,
            languages: true,
            connectedServices: true,
            memoryMetadata: true,
            updatedAt: true,
          },
        },
        connectedAccounts: {
          select: {
            provider: true,
            scope: true,
            tokenExpiresAt: true,
            linkedAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) throw AppError.notFound("MAX Account not found");

    return {
      version: PERSONALIZATION_VERSION,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        language: user.language,
        timezone: user.timezone,
        subscriptionTier: user.subscriptionTier,
      },
      profile: {
        interests: parseJson(user.aiProfile?.interests),
        preferences: parseJson(user.aiProfile?.preferences),
        languages: Array.isArray(user.aiProfile?.languages) ? user.aiProfile?.languages : [],
        connectedServices: parseJson(user.aiProfile?.connectedServices),
        memoryMetadata: parseJson(user.aiProfile?.memoryMetadata),
        updatedAt: user.aiProfile?.updatedAt?.toISOString() || null,
      },
      connectedAccounts: sanitizeConnectedServices(user.connectedAccounts),
    };
  },

  async updateProfile(userId: string, patch: {
    interests?: unknown;
    preferences?: unknown;
    languages?: unknown;
    connectedServices?: unknown;
    memoryMetadata?: unknown;
  }) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw AppError.notFound("MAX Account not found");

    const current = await prisma.aIProfile.findUnique({ where: { userId } });
    const data: Record<string, unknown> = {};

    if (patch.interests !== undefined) data.interests = patch.interests;
    if (patch.preferences !== undefined) data.preferences = patch.preferences;
    if (patch.languages !== undefined) data.languages = patch.languages;
    if (patch.connectedServices !== undefined) data.connectedServices = patch.connectedServices;
    if (patch.memoryMetadata !== undefined) data.memoryMetadata = patch.memoryMetadata;

    return prisma.aIProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  },

  async updateServiceSignals(userId: string, provider: string, signals: Record<string, unknown>) {
    const profile = await prisma.aIProfile.findUnique({ where: { userId }, select: { connectedServices: true } });
    const connectedServices = parseJson(profile?.connectedServices);
    const existingProvider = parseJson(connectedServices[provider]);

    return this.updateProfile(userId, {
      connectedServices: {
        ...connectedServices,
        [provider]: {
          ...existingProvider,
          ...signals,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  },
};
