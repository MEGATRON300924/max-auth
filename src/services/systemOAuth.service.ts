import { prisma } from "../database/prisma";
import { hashPassword } from "../security/password";

export const DEVELOPER_PLATFORM_CLIENT_ID = "max_client_developers_platform_v1";
const DEVELOPER_PLATFORM_REDIRECT_URI = "https://developers.max-ai.name.ng/auth/callback";

export async function ensureSystemOAuthClients() {
  const existing = await prisma.oAuthClient.findUnique({ where: { clientId: DEVELOPER_PLATFORM_CLIENT_ID } });
  if (existing) {
    if (!existing.isActive || existing.isConfidential || existing.name !== "MAX Developer Platform" || !existing.redirectUris.includes(DEVELOPER_PLATFORM_REDIRECT_URI)) {
      await prisma.oAuthClient.update({
        where: { id: existing.id },
        data: {
          name: "MAX Developer Platform",
          redirectUris: [DEVELOPER_PLATFORM_REDIRECT_URI],
          scopes: ["openid", "profile", "email"],
          isConfidential: false,
          isActive: true,
        },
      });
    }
    return;
  }

  await prisma.oAuthClient.create({
    data: {
      clientId: DEVELOPER_PLATFORM_CLIENT_ID,
      clientSecretHash: await hashPassword(`system-public-client-${Date.now()}-${Math.random()}`),
      name: "MAX Developer Platform",
      ownerId: null,
      redirectUris: [DEVELOPER_PLATFORM_REDIRECT_URI],
      scopes: ["openid", "profile", "email"],
      isConfidential: false,
      isActive: true,
    },
  });
}
