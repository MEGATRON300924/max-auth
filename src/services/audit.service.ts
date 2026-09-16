import { prisma } from "../database/prisma";
import { AuditAction, Prisma } from "@prisma/client";
import { webhookService } from "./webhook.service";

interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

const webhookEventForAudit: Partial<Record<AuditAction, string>> = {
  REGISTER: "user.created",
  LOGIN_SUCCESS: "user.login",
  OAUTH_CLIENT_CREATED: "oauth.client.created",
  OAUTH_CONSENT_GRANTED: "oauth.consent.granted",
  OAUTH_CONSENT_REVOKED: "oauth.consent.revoked",
};

export const auditService = {
  async record(action: AuditAction, ctx: AuditContext) {
    const audit = await prisma.auditLog.create({
      data: {
        action,
        userId: ctx.userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: ctx.metadata,
      },
    });

    const eventType = webhookEventForAudit[action];
    if (eventType && ctx.userId) {
      void prisma
        .$queryRawUnsafe<any[]>(`SELECT id FROM webhook_endpoints WHERE user_id = $1::uuid AND active = true`, ctx.userId)
        .then((endpoints) =>
          Promise.all(
            endpoints.map((endpoint) =>
              webhookService.deliver(endpoint.id, eventType, {
                userId: ctx.userId,
                action,
                metadata: ctx.metadata ?? null,
              })
            )
          )
        )
        .catch(() => undefined);
    }

    return audit;
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
    return prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  },

  async listLoginHistoryForUser(userId: string, take = 50) {
    return prisma.loginHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  },
};
