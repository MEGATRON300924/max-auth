import { NextFunction, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { mailService } from "../services/mail.service";
import { nanoid } from "nanoid";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { ok } from "../utils/response";

export const businessesController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const input = req.body;
      const business = await prisma.$transaction(async (tx) => {
        const created = await tx.business.create({ data: {
          businessId: `maxbiz_${nanoid(16)}`,
          legalName: input.legalName,
          displayName: input.displayName,
          handle: input.handle,
          businessType: input.businessType,
          country: input.country.toUpperCase(),
          businessEmail: input.businessEmail.toLowerCase(),
          phone: input.phone,
          website: input.website,
          description: input.description,
          ownerId: userId,
          memberships: { create: { userId, role: "OWNER" } },
        } });
        await tx.businessAuditLog.create({ data: { businessId: created.id, actorId: userId, action: "BUSINESS_CREATED", metadata: { handle: created.handle }, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 1000) } });
        return created;
      });
      return ok(res, { business }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return next(AppError.conflict("That business handle or ID is already in use", "BUSINESS_HANDLE_TAKEN"));
      return next(error);
    }
  },
  async listMine(req: Request, res: Response, next: NextFunction) {
    try {
      const memberships = await prisma.businessMembership.findMany({ where: { userId: req.user!.sub, isActive: true, business: { status: "ACTIVE" } }, orderBy: { createdAt: "desc" }, include: { business: true } });
      return ok(res, { businesses: memberships.map(({ role, business }) => ({ ...business, role })) });
    } catch (error) { return next(error); }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const membership = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId } } });
      if (!membership?.isActive) throw AppError.forbidden("You do not have access to this business", "BUSINESS_ACCESS_DENIED");
      const memberCount = await prisma.businessMembership.count({ where: { businessId: business.id, isActive: true } });
      return ok(res, { business: { ...business, memberCount, role: membership.role } });
    } catch (error) { return next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const membership = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId } } });
      if (!membership?.isActive) throw AppError.forbidden("You do not have access to this business", "BUSINESS_ACCESS_DENIED");
      if (membership.role !== "OWNER" && membership.role !== "ADMINISTRATOR") throw AppError.forbidden("Only a business owner or administrator can update the profile", "BUSINESS_PERMISSION_DENIED");
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.business.update({ where: { id: business.id }, data: req.body });
        await tx.businessAuditLog.create({ data: { businessId: business.id, actorId: userId, action: "BUSINESS_UPDATED", metadata: { changedFields: Object.keys(req.body) }, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 1000) } });
        return result;
      });
      return ok(res, { business: updated });
    } catch (error) { return next(error); }
  },
  async listMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const membership = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId } } });
      if (!membership?.isActive) throw AppError.forbidden("You do not have access to this business", "BUSINESS_ACCESS_DENIED");
      if (membership.role !== "OWNER" && membership.role !== "ADMINISTRATOR") throw AppError.forbidden("Only a business owner or administrator can view the member directory", "BUSINESS_PERMISSION_DENIED");
      const members = await prisma.businessMembership.findMany({ where: { businessId: business.id, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, isActive: true, createdAt: true, user: { select: { id: true, username: true, fullName: true, displayName: true, avatarUrl: true } } } });
      return ok(res, { members });
    } catch (error) { return next(error); }
  },
  async updateMemberRole(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const actor = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: actorId } } });
      if (!actor?.isActive) throw AppError.forbidden("You do not have access to this business", "BUSINESS_ACCESS_DENIED");
      if (actor.role !== "OWNER" && actor.role !== "ADMINISTRATOR") throw AppError.forbidden("Only an owner or administrator can manage member roles", "BUSINESS_PERMISSION_DENIED");

      const target = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: req.params.userId } } });
      if (!target?.isActive) throw AppError.notFound("Active business member not found", "BUSINESS_MEMBER_NOT_FOUND");
      if (target.role === "OWNER") throw AppError.forbidden("The owner role cannot be changed here. Use an ownership-transfer flow.", "BUSINESS_OWNER_PROTECTED");
      if (target.role === "ADMINISTRATOR" && actor.role !== "OWNER") throw AppError.forbidden("Only the owner can change an administrator's role", "BUSINESS_PERMISSION_DENIED");
      if (req.body.role === "ADMINISTRATOR" && actor.role !== "OWNER") throw AppError.forbidden("Only the owner can promote a member to administrator", "BUSINESS_PERMISSION_DENIED");

      const updated = await prisma.$transaction(async (tx) => {
        const member = await tx.businessMembership.update({
          where: { id: target.id },
          data: { role: req.body.role },
          select: { id: true, userId: true, role: true, isActive: true, updatedAt: true },
        });
        await tx.businessAuditLog.create({ data: {
          businessId: business.id,
          actorId,
          action: "MEMBER_ROLE_CHANGED",
          metadata: { targetUserId: target.userId, previousRole: target.role, newRole: req.body.role },
          ipAddress: req.ip,
          userAgent: req.get("user-agent")?.slice(0, 1000),
        } });
        return member;
      });
      return ok(res, { member: updated });
    } catch (error) { return next(error); }
  },
  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const actor = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: actorId } } });
      if (!actor?.isActive) throw AppError.forbidden("You do not have access to this business", "BUSINESS_ACCESS_DENIED");

      const target = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: req.params.userId } } });
      if (!target?.isActive) throw AppError.notFound("Active business member not found", "BUSINESS_MEMBER_NOT_FOUND");
      if (target.role === "OWNER") throw AppError.forbidden("The owner cannot be removed. Transfer ownership first.", "BUSINESS_OWNER_PROTECTED");
      if (actor.role !== "OWNER" && actor.role !== "ADMINISTRATOR") {
        if (target.userId !== actorId) throw AppError.forbidden("You can only leave the business yourself", "BUSINESS_PERMISSION_DENIED");
      } else if (actor.role === "ADMINISTRATOR" && target.role === "ADMINISTRATOR") {
        throw AppError.forbidden("Only the owner can remove an administrator", "BUSINESS_PERMISSION_DENIED");
      }

      await prisma.$transaction(async (tx) => {
        await tx.businessMembership.update({ where: { id: target.id }, data: { isActive: false } });
        await tx.businessAuditLog.create({ data: {
          businessId: business.id,
          actorId,
          action: "MEMBER_REMOVED",
          metadata: { targetUserId: target.userId, previousRole: target.role },
          ipAddress: req.ip,
          userAgent: req.get("user-agent")?.slice(0, 1000),
        } });
      });
      return ok(res, { removed: true, userId: target.userId });
    } catch (error) { return next(error); }
  },
  async createInvitation(req: Request, res: Response, next: NextFunction) {
    let invitationId: string | undefined;
    try {
      const actorId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const actor = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: actorId } } });
      if (!actor?.isActive || (actor.role !== "OWNER" && actor.role !== "ADMINISTRATOR")) throw AppError.forbidden("Only a business owner or administrator can invite members", "BUSINESS_PERMISSION_DENIED");
      if (req.body.role === "ADMINISTRATOR" && actor.role !== "OWNER") throw AppError.forbidden("Only the owner can invite an administrator", "BUSINESS_PERMISSION_DENIED");

      if (env.isProduction && env.MAIL_PROVIDER === "console") throw new AppError("Business invitation email is not configured. Set MAIL_PROVIDER=resend and configure the Resend credentials before inviting team members.", 503, "BUSINESS_EMAIL_NOT_CONFIGURED");
      const email = String(req.body.email).trim().toLowerCase();
      const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existingUser) {
        const existingMembership = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: existingUser.id } } });
        if (existingMembership?.isActive) throw AppError.conflict("This person is already an active member of the business", "BUSINESS_MEMBER_EXISTS");
      }

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitation = await prisma.businessInvitation.upsert({
        where: { businessId_email: { businessId: business.id, email } },
        create: { businessId: business.id, inviterId: actorId, email, role: req.body.role, tokenHash, expiresAt },
        update: { inviterId: actorId, role: req.body.role, tokenHash, expiresAt, acceptedAt: null, revokedAt: null },
        select: { id: true, email: true, role: true, expiresAt: true },
      });
      invitationId = invitation.id;
      const inviteUrl = new URL("/businesses/accept-invitation", env.FRONTEND_URL);
      inviteUrl.searchParams.set("token", rawToken);
      const subject = `Invitation to join ${business.displayName} on MAX`;
      const textBody = `You have been invited to join ${business.displayName} on MAX as ${invitation.role.toLowerCase().replace("_", " ")}.\n\nSign in to your MAX account with ${email} and accept the invitation here:\n${inviteUrl.toString()}\n\nThis invitation expires on ${expiresAt.toISOString()}. If you weren't expecting this invitation, you can ignore this email.`;
      const safeName = business.displayName.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
      await mailService.send({ to: email, subject, text: textBody, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><p style="font-weight:700;color:#2563eb">MAX AUTH FOR BUSINESSES</p><h1>You're invited to join ${safeName}</h1><p>You have been invited as <strong>${invitation.role.toLowerCase().replace("_", " ")}</strong>.</p><p>Sign in to your MAX account using this email address to accept the invitation.</p><p><a href="${inviteUrl.toString()}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:24px;text-decoration:none;font-weight:700">Accept invitation</a></p><p style="font-size:13px;color:#667085">This link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.</p></div>` });
      await prisma.businessAuditLog.create({ data: { businessId: business.id, actorId, action: "INVITATION_CREATED", metadata: { invitationId: invitation.id, email, role: invitation.role, expiresAt: expiresAt.toISOString() }, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 1000) } });
      return ok(res, { invitation, delivery: "sent" }, 201);
    } catch (error) {
      if (invitationId) {
        await prisma.businessInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } }).catch(() => undefined);
      }
      if (error instanceof AppError) return next(error);
      if ((error as { code?: string }).code === "P2002") return next(AppError.conflict("An invitation for this email already exists", "BUSINESS_INVITATION_EXISTS"));
      return next(new AppError("We couldn't send the invitation email. Check the email provider configuration and try again.", 503, "BUSINESS_INVITATION_DELIVERY_FAILED"));
    }
  },
  async listInvitations(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const actor = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: actorId } } });
      if (!actor?.isActive || (actor.role !== "OWNER" && actor.role !== "ADMINISTRATOR")) throw AppError.forbidden("Only a business owner or administrator can view invitations", "BUSINESS_PERMISSION_DENIED");
      const invitations = await prisma.businessInvitation.findMany({
        where: { businessId: business.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, inviter: { select: { username: true, displayName: true, fullName: true } } },
      });
      return ok(res, { invitations });
    } catch (error) { return next(error); }
  },
  async revokeInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const actor = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: actorId } } });
      if (!actor?.isActive || (actor.role !== "OWNER" && actor.role !== "ADMINISTRATOR")) throw AppError.forbidden("Only a business owner or administrator can revoke invitations", "BUSINESS_PERMISSION_DENIED");
      const invitation = await prisma.businessInvitation.findFirst({ where: { id: req.params.invitationId, businessId: business.id, acceptedAt: null, revokedAt: null } });
      if (!invitation) throw AppError.notFound("Pending invitation not found", "BUSINESS_INVITATION_NOT_FOUND");
      await prisma.$transaction(async (tx) => {
        await tx.businessInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
        await tx.businessAuditLog.create({ data: { businessId: business.id, actorId, action: "INVITATION_REVOKED", metadata: { invitationId: invitation.id, email: invitation.email }, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 1000) } });
      });
      return ok(res, { revoked: true, invitationId: invitation.id });
    } catch (error) { return next(error); }
  },
  async acceptInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const tokenHash = createHash("sha256").update(String(req.body.token)).digest("hex");
      const invitation = await prisma.businessInvitation.findUnique({ where: { tokenHash }, include: { business: true } });
      if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date() || invitation.business.status !== "ACTIVE") {
        throw AppError.badRequest("This invitation is invalid, expired, or has already been used", "BUSINESS_INVITATION_INVALID");
      }
      const user = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, email: true, verificationStatus: true } });
      if (!user) throw AppError.unauthorized();
      if (user.email.toLowerCase() !== invitation.email.toLowerCase()) throw AppError.forbidden("Sign in with the email address that received this invitation", "BUSINESS_INVITATION_EMAIL_MISMATCH");
      if (user.verificationStatus !== "VERIFIED") throw AppError.forbidden("Verify your MAX account email before accepting a business invitation", "BUSINESS_EMAIL_VERIFICATION_REQUIRED");

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.businessInvitation.updateMany({
          where: { id: invitation.id, tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw AppError.conflict("This invitation has already been used or is no longer valid", "BUSINESS_INVITATION_ALREADY_USED");
        const membership = await tx.businessMembership.findUnique({ where: { businessId_userId: { businessId: invitation.businessId, userId: actorId } } });
        if (membership?.isActive) throw AppError.conflict("You are already an active member of this business", "BUSINESS_MEMBER_EXISTS");
        if (membership) {
          await tx.businessMembership.update({ where: { id: membership.id }, data: { role: invitation.role, isActive: true } });
        } else {
          await tx.businessMembership.create({ data: { businessId: invitation.businessId, userId: actorId, role: invitation.role, isActive: true } });
        }
        await tx.businessAuditLog.create({ data: { businessId: invitation.businessId, actorId, action: "INVITATION_ACCEPTED", metadata: { invitationId: invitation.id, role: invitation.role }, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 1000) } });
      });
      return ok(res, { accepted: true, business: { businessId: invitation.business.businessId, displayName: invitation.business.displayName, handle: invitation.business.handle }, role: invitation.role });
    } catch (error) { return next(error); }
  },
  async listAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const business = await prisma.business.findUnique({ where: { businessId: req.params.businessId } });
      if (!business || business.status !== "ACTIVE") throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
      const actor = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId: business.id, userId: actorId } } });
      if (!actor?.isActive || (actor.role !== "OWNER" && actor.role !== "ADMINISTRATOR")) {
        throw AppError.forbidden("Only a business owner or administrator can view the audit history", "BUSINESS_PERMISSION_DENIED");
      }
      const events = await prisma.businessAuditLog.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          actor: { select: { username: true, displayName: true, fullName: true } },
        },
      });
      return ok(res, { events });
    } catch (error) { return next(error); }
  },
};