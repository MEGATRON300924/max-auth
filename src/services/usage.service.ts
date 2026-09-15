import { prisma } from "../database/prisma";

export const usageService = {
  async record(params: {
    userId?: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      await prisma.usageEvent.create({
        data: {
          userId: params.userId,
          method: params.method,
          path: params.path.slice(0, 255),
          statusCode: params.statusCode,
          durationMs: params.durationMs,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
    } catch {
      // Usage telemetry must never break an API response.
    }
  },

  async summary(userId?: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = { ...(userId ? { userId } : {}), createdAt: { gte: since } };

    const [total, errors, average, topEndpoints, recent] = await Promise.all([
      prisma.usageEvent.count({ where }),
      prisma.usageEvent.count({ where: { ...where, statusCode: { gte: 400 } } }),
      prisma.usageEvent.aggregate({ where, _avg: { durationMs: true } }),
      prisma.usageEvent.groupBy({ by: ["path"], where, _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 10 }),
      prisma.usageEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, method: true, path: true, statusCode: true, durationMs: true, createdAt: true } }),
    ]);

    return {
      windowDays: 30,
      totalRequests: total,
      errorRequests: errors,
      successRequests: total - errors,
      errorRate: total ? Number(((errors / total) * 100).toFixed(2)) : 0,
      averageLatencyMs: Math.round(average._avg.durationMs ?? 0),
      topEndpoints: topEndpoints.map((entry) => ({ path: entry.path, requests: entry._count._all })),
      recent,
    };
  },
};
