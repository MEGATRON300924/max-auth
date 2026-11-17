import { prisma } from "../database/prisma";
import { hashPassword } from "../security/password";
import { generateOpaqueToken } from "../security/tokens";

export const DEVELOPER_PLATFORM_CLIENT_ID = "max_client_developers_platform_v1";
const DEVELOPER_PLATFORM_REDIRECT_URI = "https://developers.max-ai.name.ng/auth/callback";
const SYSTEM_CLIENT_NAME = "MAX Developer Platform";
const SYSTEM_CLIENT_SCOPES = ["openid", "profile", "email"];

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "P2002";
}

export async function ensureSystemOAuthClients() {
  const existing = await prisma.oAuthClient.findUnique({ where: { clientId: DEVELOPER_PLATFORM_CLIENT_ID } });
  if (existing) {
    const configChanged =
      existing.name !== SYSTEM_CLIENT_NAME ||
      existing.isConfidential ||
      JSON.stringify([...existing.redirectUris].sort()) !== JSON.stringify([DEVELOPER_PLATFORM_REDIRECT_URI]) ||
      JSON.stringify([...existing.scopes].sort()) !== JSON.stringify([...SYSTEM_CLIENT_SCOPES].sort());
    if (configChanged) {
      // Repair the reserved client's fixed configuration, but never silently
      // reactivate a client that an administrator deliberately disabled.
      await prisma.oAuthClient.update({
        where: { id: existing.id },
        data: {
          name: SYSTEM_CLIENT_NAME,
          redirectUris: [DEVELOPER_PLATFORM_REDIRECT_URI],
          scopes: SYSTEM_CLIENT_SCOPES,
          isConfidential: false,
        },
      });
    }
    return;
  }

  try {
    await prisma.oAuthClient.create({
      data: {
        clientId: DEVELOPER_PLATFORM_CLIENT_ID,
        clientSecretHash: await hashPassword(generateOpaqueToken(32)),
        name: SYSTEM_CLIENT_NAME,
        ownerId: null,
        redirectUris: [DEVELOPER_PLATFORM_REDIRECT_URI],
        scopes: SYSTEM_CLIENT_SCOPES,
        isConfidential: false,
        isActive: true,
      },
    });
  } catch (error) {
    // Multiple instances may initialize at the same time. A unique-key race
    // means another instance created the reserved client first.
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await prisma.oAuthClient.findUnique({ where: { clientId: DEVELOPER_PLATFORM_CLIENT_ID } });
    if (!raced) throw error;
  }
}
