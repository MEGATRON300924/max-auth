import { prisma } from "../database/prisma";
import { Prisma } from "@prisma/client";

export const userRepository = {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  },

  /** Finds by email OR username — used at login since users may enter either. */
  findByIdentifier(identifier: string) {
    const normalized = identifier.toLowerCase();
    return prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { username: identifier }],
      },
    });
  },

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return prisma.user.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date() },
    });
  },

  list(params: { skip: number; take: number; search?: string }) {
    const where: Prisma.UserWhereInput = params.search
      ? {
          OR: [
            { email: { contains: params.search, mode: "insensitive" } },
            { username: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {};

    return prisma.$transaction([
      prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);
  },
};
