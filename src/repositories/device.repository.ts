import { prisma } from "../database/prisma";
import { Prisma } from "@prisma/client";

export const deviceRepository = {
  findByFingerprint(fingerprint: string) {
    return prisma.device.findUnique({ where: { fingerprint } });
  },

  create(data: Prisma.DeviceCreateInput) {
    return prisma.device.create({ data });
  },

  touch(id: string, ip?: string) {
    return prisma.device.update({
      where: { id },
      data: { lastSeenAt: new Date(), lastIp: ip },
    });
  },

  trust(id: string) {
    return prisma.device.update({
      where: { id },
      data: { isTrusted: true, trustedAt: new Date() },
      select: {
        id: true, deviceName: true, deviceType: true, os: true, browser: true,
        isTrusted: true, trustedAt: true, lastIp: true, lastSeenAt: true, createdAt: true,
      },
    });
  },

  listForUser(userId: string) {
    return prisma.device.findMany({
      where: { userId },
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
        createdAt: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.device.findUnique({ where: { id }, select: { id: true, userId: true } });
  },

  remove(id: string) {
    return prisma.device.delete({ where: { id } });
  },
};
