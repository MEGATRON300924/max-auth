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
    });
  },

  listForUser(userId: string) {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.device.findUnique({ where: { id } });
  },

  remove(id: string) {
    return prisma.device.delete({ where: { id } });
  },
};
