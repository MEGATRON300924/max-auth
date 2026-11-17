import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { userRepository } from "../repositories/user.repository";
import { ok, sanitizeUser } from "../utils/response";
import { AppError } from "../utils/AppError";
import { auditService } from "../services/audit.service";
import { getRequestContext } from "../utils/requestContext";
import { mailService } from "../services/mail.service";
import { BusinessVerificationStatus } from "@prisma/client";
import { oauthService } from "../services/oauth.service";
function sanitizeBusiness<T extends { emailVerificationTokenHash?: string | null; emailVerificationExpiresAt?: Date | null }>(business: T) {
  const { emailVerificationTokenHash, emailVerificationExpiresAt, ...safe } = business;
  return safe;
}


export const adminController = {
  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "25", 10) || 25));
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : undefined;

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
      const user = await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
        if (!target) throw AppError.notFound("User not found");
        const revokedAt = new Date();
        const updated = await tx.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } });
        await tx.session.updateMany({ where: { userId: target.id, isRevoked: false }, data: { isRevoked: true, revokedAt } });
        await tx.oAuthAccessToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt } });
        await tx.oAuthRefreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt } });
        await tx.oAuthAuthorizationCode.deleteMany({ where: { userId: target.id } });
        await tx.oAuthConsent.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt } });
        await tx.verificationToken.updateMany({ where: { userId: target.id, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: revokedAt } });
        return updated;
      });
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
      const existing = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, status: true } });
      if (!existing) throw AppError.notFound("User not found");
      if (existing.status === "DELETED") throw AppError.forbidden("Deleted MAX Accounts cannot be reactivated.", "ACCOUNT_DELETED");
      const parentalConsent = await prisma.familyConsentRequest.findUnique({
        where: { childUserId: existing.id },
        select: { status: true },
      });
      if (parentalConsent && parentalConsent.status !== "APPROVED") {
        throw AppError.forbidden("This account cannot be reactivated until parental approval is completed.", "PARENTAL_APPROVAL_REQUIRED");
      }
      const user = await prisma.user.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
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
      return ok(res, { organisations: organisations.map(sanitizeBusiness), counts: { UNVERIFIED: counts[0], PENDING: counts[1], VERIFIED: counts[2], REJECTED: counts[3] }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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
      return ok(res, { organisation: sanitizeBusiness(updated), emailSent });
    } catch (err) { next(err); }
  },

  async listOAuthClients(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const where: any = search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { clientId: { contains: search, mode: "insensitive" } },
        { owner: { username: { contains: search, mode: "insensitive" } } },
        { owner: { email: { contains: search, mode: "insensitive" } } },
      ] } : {};
      const [clients, total] = await Promise.all([
        prisma.oAuthClient.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" },
          select: { id: true, clientId: true, name: true, ownerId: true, redirectUris: true, scopes: true, isConfidential: true, isActive: true, createdAt: true, updatedAt: true,
            owner: { select: { id: true, username: true, fullName: true, email: true } } } }),
        prisma.oAuthClient.count({ where }),
      ]);
      return ok(res, { clients, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) { next(err); }
  },

  async updateOAuthClient(req: Request, res: Response, next: NextFunction) {
    try {
      const client = await prisma.oAuthClient.findUnique({
        where: { id: req.params.clientId },
        select: { id: true, clientId: true, ownerId: true },
      });
      if (!client) throw AppError.notFound("OAuth client not found");
      const { name, redirectUris, scopes, isConfidential } = req.body as {
        name?: string; redirectUris?: string[]; scopes?: string[]; isConfidential?: boolean;
      };
      const updated = await oauthService.updateClientAsAdmin(client.id, { name, redirectUris, scopes, isConfidential });
      const ctx = getRequestContext(req);
      await auditService.record("ADMIN_ACTION", {
        userId: req.user!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          action: "OAUTH_CLIENT_ADMIN_UPDATED",
          clientDatabaseId: client.id,
          clientId: client.clientId,
          ownerId: client.ownerId,
          changedFields: Object.keys(req.body),
        },
      });
      return ok(res, { client: updated });
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
