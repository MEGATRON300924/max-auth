import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";

export const notificationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
      const [items, unread] = await Promise.all([
        prisma.adminBroadcastRecipient.findMany({
          where: { userId: req.user!.sub }, skip: (page - 1) * limit, take: limit,
          orderBy: { createdAt: "desc" },
          include: { broadcast: { select: { id: true, title: true, body: true, audience: true, createdAt: true, author: { select: { username: true } } } } },
        }),
        prisma.adminBroadcastRecipient.count({ where: { userId: req.user!.sub, readAt: null } }),
      ]);
      return ok(res, { notifications: items.map(item => ({ id: item.id, readAt: item.readAt, createdAt: item.createdAt, ...item.broadcast, author: item.broadcast.author.username })), unread, page, limit });
    } catch (error) { next(error); }
  },
  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await prisma.adminBroadcastRecipient.updateMany({
        where: { id: req.params.notificationId, userId: req.user!.sub, readAt: null },
        data: { readAt: new Date() },
      });
      if (!result.count) throw AppError.notFound("Notification not found or already read");
      return ok(res, { read: true });
    } catch (error) { next(error); }
  },
};
