import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { userRepository } from "../repositories/user.repository";
import { ok, sanitizeUser } from "../utils/response";
import { AppError } from "../utils/AppError";
import { auditService } from "../services/audit.service";
import { getRequestContext } from "../utils/requestContext";

export const adminController = {
  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = Math.min(parseInt((req.query.limit as string) || "25", 10), 100);
      const search = req.query.search as string | undefined;

      const [users, total] = await userRepository.list({
        skip: (page - 1) * limit,
        take: limit,
        search,
      });

      return ok(res, {
        users: users.map(sanitizeUser),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userRepository.findById(req.params.userId);
      if (!user) throw AppError.notFound("User not found");
      return ok(res, { user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  },

  async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const user = await userRepository.update(req.params.userId, { status: "SUSPENDED" });
      await auditService.record("ACCOUNT_SUSPENDED", {
        userId: req.params.userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { actorId: req.user!.sub },
      });
      return ok(res, { user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  },

  async reactivateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const user = await userRepository.update(req.params.userId, { status: "ACTIVE" });
      await auditService.record("ACCOUNT_REACTIVATED", {
        userId: req.params.userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { actorId: req.user!.sub },
      });
      return ok(res, { user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  },

  async stats(_req: Request, res: Response, next: NextFunction) {
    try {
      const [totalUsers, verifiedUsers, activeSessions, byTier] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { verificationStatus: "VERIFIED" } }),
        prisma.session.count({ where: { isRevoked: false, expiresAt: { gt: new Date() } } }),
        prisma.user.groupBy({ by: ["subscriptionTier"], _count: true }),
      ]);
      return ok(res, { totalUsers, verifiedUsers, activeSessions, byTier });
    } catch (err) {
      next(err);
    }
  },
};
