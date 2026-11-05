import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";
import { auditService } from "../services/audit.service";

export const spotlightReviewAccessController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewers = await prisma.spotlightEntityReviewer.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, displayName: true, fullName: true, email: true, status: true } },
          grantedBy: { select: { id: true, username: true } },
        },
      });
      return ok(res, { reviewers });
    } catch (error) { next(error); }
  },

  async grant(req: Request, res: Response, next: NextFunction) {
    try {
      const username = String(req.body.username || "").trim();
      const user = await prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
        select: { id: true, username: true, displayName: true, fullName: true, email: true, status: true },
      });
      if (!user) throw AppError.notFound("MAX Auth user not found", "USER_NOT_FOUND");
      if (user.status !== "ACTIVE") throw AppError.badRequest("Only active MAX Auth users can be entity reviewers", "USER_NOT_ACTIVE");

      const reviewer = await prisma.spotlightEntityReviewer.upsert({
        where: { userId: user.id },
        create: { userId: user.id, grantedById: req.user!.sub },
        update: { grantedById: req.user!.sub },
        include: { user: { select: { id: true, username: true, displayName: true, fullName: true, email: true, status: true } } },
      });
      await auditService.record("ADMIN_ACTION", {
        userId: req.user!.sub,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        metadata: { action: "SPOTLIGHT_ENTITY_REVIEW_ACCESS_GRANTED", targetUserId: user.id, username: user.username },
      });
      return ok(res, { reviewer });
    } catch (error) { next(error); }
  },

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const targetUserId = req.params.userId;
      const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true } });
      if (!target) throw AppError.notFound("MAX Auth user not found", "USER_NOT_FOUND");
      if (target.id === req.user!.sub) throw AppError.badRequest("You cannot revoke your own reviewer access from this action", "SELF_REVOCATION_BLOCKED");
      const deleted = await prisma.spotlightEntityReviewer.deleteMany({ where: { userId: targetUserId } });
      if (!deleted.count) throw AppError.notFound("Entity reviewer access was not found", "REVIEWER_ACCESS_NOT_FOUND");
      await auditService.record("ADMIN_ACTION", {
        userId: req.user!.sub,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        metadata: { action: "SPOTLIGHT_ENTITY_REVIEW_ACCESS_REVOKED", targetUserId, username: target.username },
      });
      return ok(res, { revoked: true, userId: targetUserId });
    } catch (error) { next(error); }
  },

  async myPermission(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewer = await prisma.spotlightEntityReviewer.findUnique({
        where: { userId: req.user!.sub },
        select: { createdAt: true, grantedBy: { select: { username: true } } },
      });
      return ok(res, { permissions: { spotlightEntities: { canReview: Boolean(reviewer), grantedAt: reviewer?.createdAt ?? null, grantedBy: reviewer?.grantedBy?.username ?? null } } });
    } catch (error) { next(error); }
  },

  async servicePermission(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, status: true } });
      if (!user || user.status !== "ACTIVE") throw AppError.notFound("Active MAX Auth user not found", "USER_NOT_FOUND");
      const reviewer = await prisma.spotlightEntityReviewer.findUnique({ where: { userId: user.id }, select: { createdAt: true } });
      return ok(res, { userId: user.id, canReviewEntities: Boolean(reviewer), grantedAt: reviewer?.createdAt ?? null });
    } catch (error) { next(error); }
  },
};
