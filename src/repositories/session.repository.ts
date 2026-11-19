import { prisma } from "../database/prisma";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { calculateIdleExpiry } from "../security/sessionPolicy";

export const sessionRepository = {
  create(data: Prisma.SessionCreateInput) {
    return prisma.session.create({ data });
  },

  findByRefreshTokenHash(refreshTokenHash: string) {
    return prisma.session.findUnique({ where: { refreshTokenHash } });
  },

  findById(id: string) {
    return prisma.session.findUnique({ where: { id }, include: { user: { select: { status: true } } } });
  },

  revokeIfActive(id: string) {
    return prisma.session.updateMany({ where: { id, isRevoked: false }, data: { isRevoked: true, revokedAt: new Date() } });
  },

  revoke(id: string) {
    return prisma.session.update({
      where: { id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  },

  revokeAllForDevice(deviceId: string) {
    return prisma.session.updateMany({
      where: { deviceId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  },

  revokeAllForFamily(familyId: string) {
    return prisma.session.updateMany({
      where: { familyId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  },

  touchLastUsed(id: string) {
    return prisma.session.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  },

  touchActivity(id: string, absoluteExpiresAt: Date) {
    const now = new Date();
    const idleExpiresAt = calculateIdleExpiry(now, absoluteExpiresAt, env.SESSION_IDLE_TIMEOUT_DAYS);
    return prisma.session.update({
      where: { id },
      data: { lastUsedAt: now, expiresAt: idleExpiresAt },
    });
  },

  listActiveForUser(userId: string) {
    return prisma.session.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        createdAt: true,
        lastUsedAt: true,
        device: {
          select: {
            id: true,
            deviceName: true,
            deviceType: true,
            os: true,
            browser: true,
            isTrusted: true,
            trustedAt: true,
            lastIp: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: { lastUsedAt: "desc" },
    });
  },
};
