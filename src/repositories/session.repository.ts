import { prisma } from "../database/prisma";
import { Prisma } from "@prisma/client";

export const sessionRepository = {
  create(data: Prisma.SessionCreateInput) {
    return prisma.session.create({ data });
  },

  findByRefreshTokenHash(refreshTokenHash: string) {
    return prisma.session.findUnique({ where: { refreshTokenHash } });
  },

  revoke(id: string) {
    return prisma.session.update({
      where: { id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  },

  touchLastUsed(id: string) {
    return prisma.session.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  },

  listActiveForUser(userId: string) {
    return prisma.session.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      include: { device: true },
      orderBy: { lastUsedAt: "desc" },
    });
  },
};
