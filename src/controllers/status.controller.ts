import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";

const DEFAULT_STATUS = {
  "WhatsApp": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "Discord": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "Telegram": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "Messenger": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "Instagram": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "Webchat": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "GitHub": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "Microsoft Teams": {
    "category": "social",
    "status": "green",
    "reason": ""
  },
  "MAX AI": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Home": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Car OS": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Music": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Cloud": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Browser": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Voice": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Connect": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Auth": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Store": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Studio": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Security": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX Pay": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "MAX OS": {
    "category": "ai",
    "status": "green",
    "reason": ""
  },
  "GitHub Chat Extension": {
    "category": "development",
    "status": "green",
    "reason": ""
  },
  "VS Code Extension": {
    "category": "development",
    "status": "green",
    "reason": ""
  }
};

function serialize(record: { status: Prisma.JsonValue; updatedAt: Date; updatedBy: string }) {
  return {
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
    serviceCount: Object.keys(record.status && typeof record.status === "object" && !Array.isArray(record.status) ? record.status : {}).length,
  };
}

export const statusController = {
  async get(_req: Request, res: Response, next: NextFunction) {
    try {
      const record = await prisma.systemStatus.findUnique({ where: { id: "global" } });
      if (!record) throw new AppError("System status has not been initialized", 503, "STATUS_NOT_INITIALIZED");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, serialize(record));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const incoming = req.body.status as Record<string, { status: string; reason: string }>;
      const normalized: Record<string, { category: string; status: "green" | "yellow" | "red"; reason: string }> = {};
      for (const [name, defaults] of Object.entries(DEFAULT_STATUS)) {
        const value = incoming[name];
        if (!value || !["green", "yellow", "red"].includes(value.status)) {
          throw AppError.badRequest(`A valid status is required for ${name}`, "INVALID_SERVICE_STATUS");
        }
        normalized[name] = {
          category: defaults.category,
          status: value.status as "green" | "yellow" | "red",
          reason: typeof value.reason === "string" ? value.reason.trim().slice(0, 1000) : "",
        };
      }

      const record = await prisma.systemStatus.upsert({
        where: { id: "global" },
        create: { id: "global", status: normalized as Prisma.InputJsonValue, updatedBy: "The Tron Forge Limited" },
        update: { status: normalized as Prisma.InputJsonValue, updatedBy: "The Tron Forge Limited" },
      });

      const actor = (req as Request & { maxAdmin?: { id: string; username: string } }).maxAdmin;
      await prisma.auditLog.create({
        data: {
          userId: actor?.id,
          action: "ADMIN_ACTION",
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          metadata: {
            type: "SYSTEM_STATUS_UPDATED",
            updatedBy: "The Tron Forge Limited",
            changedServices: Object.keys(normalized),
          },
        },
      });

      res.setHeader("Cache-Control", "no-store");
      return ok(res, serialize(record));
    } catch (error) {
      next(error);
    }
  },
};
