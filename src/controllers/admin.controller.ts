import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { userRepository } from "../repositories/user.repository";
import { ok, sanitizeUser } from "../utils/response";
import { AppError } from "../utils/AppError";
import { auditService } from "../services/audit.service";
import { getRequestContext } from "../utils/requestContext";
import { mailService } from "../services/mail.service";
import { BusinessVerificationStatus } from "@prisma/client";

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


  async listOrganisations(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "25", 10) || 25));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status : "";
      const where: any = {};
      if (status && ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"].includes(status)) where.verificationStatus = status;
      if (search) where.OR = [
        { legalName: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { businessId: { contains: search, mode: "insensitive" } },
        { handle: { contains: search, mode: "insensitive" } },
      ];
      const [organisations, total, counts] = await Promise.all([
        prisma.business.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" },
          include: { owner: { select: { id: true, username: true, fullName: true, displayName: true, email: true } } } }),
        prisma.business.count({ where }),
        Promise.all([
          prisma.business.count({ where: { verificationStatus: "UNVERIFIED" } }),
          prisma.business.count({ where: { verificationStatus: "PENDING" } }),
          prisma.business.count({ where: { verificationStatus: "VERIFIED" } }),
          prisma.business.count({ where: { verificationStatus: "REJECTED" } }),
        ]),
      ]);
      return ok(res, { organisations, counts: { UNVERIFIED: counts[0], PENDING: counts[1], VERIFIED: counts[2], REJECTED: counts[3] }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) { next(err); }
  },

  async reviewOrganisation(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.params.businessId;
      const status = req.body.status as BusinessVerificationStatus;
      const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 2000) : "";
      if (status === "REJECTED" && !reason) throw AppError.badRequest("A reason is required when rejecting an organisation", "REVIEW_REASON_REQUIRED");
      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (!business) throw AppError.notFound("Organisation not found", "BUSINESS_NOT_FOUND");
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.business.update({ where: { id: businessId }, data: { verificationStatus: status } });
        await tx.businessAuditLog.create({ data: {
          businessId, actorId: req.user!.sub, action: "ORGANISATION_REVIEW_UPDATED", ipAddress: req.ip, userAgent: req.get("user-agent"),
          metadata: { previousStatus: business.verificationStatus, newStatus: status, reason: reason || null },
        } });
        return result;
      });
      let emailSent = false;
      try {
        const message = status === "VERIFIED"
          ? "Your organisation has been approved by The Tron Forge Limited (TTFL)."
          : status === "REJECTED"
            ? "Your organisation review was not approved by The Tron Forge Limited (TTFL)."
            : "The Tron Forge Limited (TTFL) has requested additional information or another review of your organisation.";
        const cleanName = business.displayName.replace(/[&<>"]/g, "");
        const cleanReason = reason.replace(/[&<>"]/g, "");
        await mailService.send({
          to: business.email,
          subject: status === "VERIFIED" ? "Your MAX business account has been approved" : status === "REJECTED" ? "Update on your MAX business account review" : "Action needed for your MAX business account",
          text: `${message}${reason ? `\n\nReviewer note: ${reason}` : ""}\n\nOrganisation: ${business.displayName} (${business.businessId})\nManage your business account: https://api.max-ai.name.ng/business`,
          html: `<p>${message}</p>${reason ? `<p><strong>Reviewer note:</strong> ${cleanReason}</p>` : ""}<p>Organisation: <strong>${cleanName}</strong> (${business.businessId})</p><p><a href="https://api.max-ai.name.ng/business">Open MAX business accounts</a></p>`,
        });
        emailSent = true;
      } catch { emailSent = false; }
      return ok(res, { organisation: updated, emailSent });
    } catch (err) { next(err); }
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
