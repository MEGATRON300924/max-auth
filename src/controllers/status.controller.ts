import { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { ok } from "../utils/response";

const SERVICE_CATALOG = [
  { name: "WhatsApp", category: "social" },
  { name: "Discord", category: "social" },
  { name: "Telegram", category: "social" },
  { name: "Messenger", category: "social" },
  { name: "Instagram", category: "social" },
  { name: "Webchat", category: "social" },
  { name: "GitHub", category: "social" },
  { name: "Microsoft Teams", category: "social" },
  { name: "MAX AI", category: "ai" },
  { name: "MAX Home", category: "ai" },
  { name: "MAX Car OS", category: "ai" },
  { name: "MAX Music", category: "ai" },
  { name: "MAX Cloud", category: "ai" },
  { name: "MAX Browser", category: "ai" },
  { name: "MAX Voice", category: "ai" },
  { name: "MAX Connect", category: "ai" },
  { name: "MAX Auth", category: "ai" },
  { name: "MAX Store", category: "ai" },
  { name: "MAX Studio", category: "ai" },
  { name: "MAX Security", category: "ai" },
  { name: "MAX Pay", category: "ai" },
  { name: "MAX OS", category: "ai" },
  { name: "GitHub Chat Extension", category: "development" },
  { name: "VS Code Extension", category: "development" },
] as const;

const ALLOWED_STATUSES = ["green", "yellow", "red"] as const;
type ServiceStatus = (typeof ALLOWED_STATUSES)[number];

export const statusController = {
  async getPublicStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const saved = await prisma.statusPageService.findMany({
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
      const savedByName = new Map(saved.map((item) => [item.name, item]));
      const services = SERVICE_CATALOG.map((service) => {
        const current = savedByName.get(service.name);
        return {
          name: service.name,
          category: service.category,
          status: current?.status ?? "green",
          reason: current?.reason ?? "",
          updatedAt: current?.updatedAt?.toISOString() ?? null,
          updatedById: current?.updatedById ?? null,
        };
      });
      const status: Record<string, { status: string; reason: string; category: string; updatedAt: string | null; updatedById: string | null }> = {};
      for (const service of services) {
        status[service.name] = {
          status: service.status,
          reason: service.reason,
          category: service.category,
          updatedAt: service.updatedAt,
          updatedById: service.updatedById,
        };
      }
      const timestamps = saved.map((item) => item.updatedAt.getTime());
      const updatedAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.status(200).json({ success: true, status, services, updatedAt, updatedBy: null });
    } catch (err) {
      return next(err);
    }
  },

  async updateService(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceName = req.params.serviceKey;
      const definition = SERVICE_CATALOG.find((service) => service.name === serviceName);
      if (!definition) throw AppError.notFound("Unknown status-page service", "STATUS_SERVICE_NOT_FOUND");

      const status = req.body.status as ServiceStatus;
      const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
      const updatedById = req.user!.sub;
      const service = await prisma.$transaction(async (tx) => {
        const saved = await tx.statusPageService.upsert({
          where: { name: definition.name },
          create: {
            serviceKey: definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
            name: definition.name,
            category: definition.category,
            status,
            reason,
            updatedById,
          },
          update: { status, reason, updatedById },
        });
        await tx.auditLog.create({
          data: {
            userId: updatedById,
            action: "ADMIN_ACTION",
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
            metadata: {
              action: "STATUS_SERVICE_UPDATED",
              service: definition.name,
              category: definition.category,
              status,
              reason: reason || null,
            },
          },
        });
        return saved;
      });

      return ok(res, {
        service: {
          name: service.name,
          category: service.category,
          status: service.status,
          reason: service.reason,
          updatedAt: service.updatedAt.toISOString(),
          updatedById: service.updatedById,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
};
