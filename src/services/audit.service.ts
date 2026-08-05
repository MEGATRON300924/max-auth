import { prisma } from "../database/prisma";
import { AuditAction, Prisma } from "@prisma/client";

interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

export const auditService = {
  async record(action: AuditAction, ctx: AuditContext) {
    return prisma.auditLog.create({
      data: {
        action,
        userId: ctx.userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: ctx.metadata,
      },
    });
  },

  async recordLogin(params: {
    userId: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
    reason?: string;
  }) {
    return prisma.loginHistory.create({
      data: {
        userId: params.userId,
        success: params.success,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        reason: params.reason,
      },
    });
  },

  async listForUser(userId: string, take = 50) {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  async listLoginHistoryForUser(userId: string, take = 50) {
    return prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
};
