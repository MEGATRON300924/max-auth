import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { ok } from "../utils/response";

type WindowKey = "1h" | "24h" | "7d";
const WINDOW_MS: Record<WindowKey, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};
const BACKEND_PREFIX = "/__service/max-backend";

function selectedWindow(value: unknown): WindowKey {
  return value === "1h" || value === "7d" ? value : "24h";
}

function rate(errors: number, total: number): number {
  return total ? Number(((errors / total) * 100).toFixed(2)) : 0;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("PROBE_TIMEOUT")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function eventService(path: string): "MAX_BACKEND" | "MAX_AUTH" {
  return path.startsWith(BACKEND_PREFIX) ? "MAX_BACKEND" : "MAX_AUTH";
}

function displayPath(path: string): string {
  return path.startsWith(BACKEND_PREFIX) ? path.slice(BACKEND_PREFIX.length) || "/" : path;
}

async function metrics(where: { createdAt: { gte: Date }; path?: { startsWith: string }; NOT?: { path: { startsWith: string } } }) {
  const [total, errors, average, top] = await Promise.all([
    prisma.usageEvent.count({ where }),
    prisma.usageEvent.count({ where: { ...where, statusCode: { gte: 400 } } }),
    prisma.usageEvent.aggregate({ where, _avg: { durationMs: true } }),
    prisma.usageEvent.groupBy({
      by: ["path"],
      where,
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 6,
    }),
  ]);
  return {
    totalRequests: total,
    errorRequests: errors,
    errorRate: rate(errors, total),
    averageLatencyMs: Math.round(average._avg.durationMs ?? 0),
    topEndpoints: top.map((item) => ({ path: displayPath(item.path), requests: item._count._all })),
  };
}

export const diagnosticsController = {
  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const window = selectedWindow(req.query.window);
      const since = new Date(Date.now() - WINDOW_MS[window]);
      const base = { createdAt: { gte: since } };
      const [overall, auth, backend, recent] = await Promise.all([
        metrics({ ...base, NOT: { path: { startsWith: "/__service/" } } }),
        metrics({ ...base, NOT: { path: { startsWith: "/__service/" } } }),
        metrics({ ...base, path: { startsWith: BACKEND_PREFIX } }),
        prisma.usageEvent.findMany({
          where: base,
          orderBy: { createdAt: "desc" },
          take: 12,
          select: { id: true, method: true, path: true, statusCode: true, durationMs: true, createdAt: true },
        }),
      ]);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, {
        window,
        since: since.toISOString(),
        overall,
        services: [
          { service: "MAX Auth", ...auth },
          { service: "MAX Backend", ...backend },
        ],
        recent: recent.map((event) => ({
          id: event.id,
          service: eventService(event.path),
          method: event.method,
          path: displayPath(event.path),
          statusCode: event.statusCode,
          durationMs: event.durationMs,
          createdAt: event.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  async events(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
      const window = selectedWindow(req.query.window);
      const since = new Date(Date.now() - WINDOW_MS[window]);
      const service = req.query.service === "MAX_BACKEND" || req.query.service === "MAX_AUTH"
        ? req.query.service
        : undefined;
      const where = {
        createdAt: { gte: since },
        ...(service === "MAX_BACKEND" ? { path: { startsWith: BACKEND_PREFIX } } : {}),
        ...(service === "MAX_AUTH" ? { NOT: { path: { startsWith: "/__service/" } } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.usageEvent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: { id: true, method: true, path: true, statusCode: true, durationMs: true, createdAt: true },
        }),
        prisma.usageEvent.count({ where }),
      ]);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, {
        events: items.map((event) => ({
          id: event.id,
          service: eventService(event.path),
          method: event.method,
          path: displayPath(event.path),
          statusCode: event.statusCode,
          durationMs: event.durationMs,
          createdAt: event.createdAt.toISOString(),
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  },

  async health(_req: Request, res: Response, next: NextFunction) {
    try {
      const checkedAt = new Date().toISOString();
      const authStarted = Date.now();
      let authStatus: "healthy" | "down" = "healthy";
      try {
        await withTimeout(prisma.$queryRaw`SELECT 1`, 2500);
      } catch {
        authStatus = "down";
      }
      const authLatencyMs = Date.now() - authStarted;

      const backendStarted = Date.now();
      let backendStatus: "healthy" | "down" | "unknown" = "unknown";
      if (env.MAX_AI_BACKEND_URL) {
        try {
          const response = await fetch(new URL("/health/ready", env.MAX_AI_BACKEND_URL), {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(3000),
            cache: "no-store",
          });
          backendStatus = response.ok ? "healthy" : "down";
        } catch {
          backendStatus = "down";
        }
      }
      const backendLatencyMs = Date.now() - backendStarted;
      const overall = authStatus === "down" ? "down" : backendStatus === "down" ? "degraded" : backendStatus === "unknown" ? "unknown" : "healthy";
      res.setHeader("Cache-Control", "no-store");
      return ok(res, {
        status: overall,
        checkedAt,
        services: [
          { service: "MAX Auth", status: authStatus, latencyMs: authLatencyMs },
          { service: "MAX Backend", status: backendStatus, latencyMs: backendLatencyMs },
        ],
      });
    } catch (error) {
      next(error);
    }
  },
};
