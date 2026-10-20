import { createHash, randomBytes } from "node:crypto";
import { BusinessMemberRole, BusinessMemberStatus, BusinessInvitationStatus, BusinessStatus, Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const makeToken = () => randomBytes(32).toString("base64url");
const slugify = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

type Context = { ipAddress?: string; userAgent?: string };
const ownerAdmin = [BusinessMemberRole.OWNER, BusinessMemberRole.ADMINISTRATOR];

async function membershipFor(businessId: string, userId: string) {
  const membership = await prisma.businessMembership.findUnique({
    where: { businessId_userId: { businessId, userId } },
    include: { business: true },
  });
  if (!membership || membership.status !== BusinessMemberStatus.ACTIVE || membership.business.status !== BusinessStatus.ACTIVE) {
    throw AppError.notFound("Business not found", "BUSINESS_NOT_FOUND");
  }
  return membership;
}

function requireRole(role: BusinessMemberRole, allowed: BusinessMemberRole[]) {
  if (!allowed.includes(role)) throw AppError.forbidden("You do not have permission to perform this business action", "BUSINESS_PERMISSION_DENIED");
}

async function logBusiness(businessId: string, actorId: string, action: string, context: Context, metadata?: Prisma.InputJsonValue) {
  await prisma.businessAuditLog.create({
    data: { businessId, actorId, action, ipAddress: context.ipAddress, userAgent: context.userAgent, ...(metadata ? { metadata } : {}) },
  });
}

export const businessService = {
  async listForUser(userId: string) {
    const rows = await prisma.businessMembership.findMany({
      where: { userId, status: BusinessMemberStatus.ACTIVE, business: { status: BusinessStatus.ACTIVE } },
      include: { business: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(({ business, role, createdAt }) => ({
      ...business,
      emailVerificationTokenHash: undefined,
      emailVerificationExpiresAt: undefined,
      role,
      joinedAt: createdAt,
    }));
  },

  async create(userId: string, input: {
    legalName: string; displayName: string; handle?: string; email: string; phone: string;
    country: string; businessType: string; websiteUrl?: string; description?: string; registrationNumber?: string;
  }, context: Context) {
    const handle = slugify(input.handle || input.displayName);
    if (handle.length < 3) throw AppError.badRequest("Choose a business handle with at least 3 letters or numbers", "INVALID_BUSINESS_HANDLE");
    if (await prisma.business.findUnique({ where: { handle } })) throw AppError.conflict("That business handle is already in use", "BUSINESS_HANDLE_TAKEN");
    const normalizedLegalName = input.legalName.trim();
    const country = input.country.trim().toUpperCase();
    const duplicateByOwner = await prisma.business.findFirst({
      where: { ownerId: userId, country, legalName: { equals: normalizedLegalName, mode: "insensitive" }, status: { not: BusinessStatus.DEACTIVATED } },
      select: { id: true },
    });
    if (duplicateByOwner) throw AppError.conflict("You already own a business with this legal name in that country. Add another property to the existing business instead.", "DUPLICATE_BUSINESS");
    if (input.registrationNumber?.trim()) {
      const duplicateRegistration = await prisma.business.findFirst({
        where: { country, registrationNumber: { equals: input.registrationNumber.trim(), mode: "insensitive" }, status: { not: BusinessStatus.DEACTIVATED } },
        select: { id: true },
      });
      if (duplicateRegistration) throw AppError.conflict("A business with that registration number already exists in this country.", "DUPLICATE_BUSINESS_REGISTRATION");
    }
    const rawVerificationToken = makeToken();
    const businessId = `maxbiz_${randomBytes(10).toString("hex")}`;
    const business = await prisma.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          businessId, handle, legalName: input.legalName.trim(), displayName: input.displayName.trim(),
          email: input.email.trim().toLowerCase(), phone: input.phone.trim(), country,
          businessType: input.businessType.trim(), websiteUrl: input.websiteUrl?.trim() || null,
          description: input.description?.trim() || null, registrationNumber: input.registrationNumber?.trim() || null,
          ownerId: userId, emailVerificationTokenHash: tokenHash(rawVerificationToken),
          emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          memberships: { create: { userId, role: BusinessMemberRole.OWNER } },
        },
      });
      await tx.businessAuditLog.create({ data: { businessId: created.id, actorId: userId, action: "BUSINESS_CREATED", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { handle, businessId } } });
      return created;
    });
    return { business: this.safeBusiness(business), verificationToken: rawVerificationToken };
  },

  safeBusiness<T extends Record<string, any>>(business: T) {
    const { emailVerificationTokenHash, emailVerificationExpiresAt, ...safe } = business;
    return safe;
  },

  async get(businessId: string, userId: string) {
    const membership = await membershipFor(businessId, userId);
    return { ...this.safeBusiness(membership.business), role: membership.role };
  },

  async update(businessId: string, userId: string, input: {
    legalName?: string; displayName?: string; email?: string; phone?: string; country?: string;
    businessType?: string; websiteUrl?: string | null; description?: string | null; registrationNumber?: string | null;
  }, context: Context) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, ownerAdmin);
    const data: Prisma.BusinessUpdateInput = {};
    let verificationToken: string | undefined;
    if (input.legalName !== undefined) data.legalName = input.legalName.trim();
    if (input.displayName !== undefined) data.displayName = input.displayName.trim();
    if (input.email !== undefined) {
      const nextEmail = input.email.trim().toLowerCase();
      if (nextEmail !== membership.business.email) {
        verificationToken = makeToken();
        data.email = nextEmail;
        data.emailVerifiedAt = null;
        data.emailVerificationTokenHash = tokenHash(verificationToken);
        data.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    }
    if (input.phone !== undefined) data.phone = input.phone.trim();
    if (input.country !== undefined) data.country = input.country.trim().toUpperCase();
    if (input.businessType !== undefined) data.businessType = input.businessType.trim();
    if (input.websiteUrl !== undefined) data.websiteUrl = input.websiteUrl?.trim() || null;
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.registrationNumber !== undefined) data.registrationNumber = input.registrationNumber?.trim() || null;
    const updated = await prisma.business.update({ where: { id: businessId }, data });
    await logBusiness(businessId, userId, "BUSINESS_PROFILE_UPDATED", context);
    return { business: this.safeBusiness(updated), verificationToken };
  },

  async resendEmailVerification(businessId: string, userId: string, context: Context) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, ownerAdmin);
    if (membership.business.emailVerifiedAt) throw AppError.conflict("This business email is already verified", "BUSINESS_EMAIL_ALREADY_VERIFIED");
    const verificationToken = makeToken();
    const business = await prisma.business.update({
      where: { id: businessId },
      data: { emailVerificationTokenHash: tokenHash(verificationToken), emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    await logBusiness(businessId, userId, "BUSINESS_EMAIL_VERIFICATION_RESENT", context);
    return { business: this.safeBusiness(business), verificationToken };
  },

  async verifyEmail(businessId: string, token: string, context: Context) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business || !business.emailVerificationTokenHash || !business.emailVerificationExpiresAt ||
      business.emailVerificationExpiresAt <= new Date() || business.emailVerificationTokenHash !== tokenHash(token)) {
      throw AppError.badRequest("This business email verification link is invalid or has expired", "BUSINESS_EMAIL_TOKEN_INVALID");
    }
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
    });
    await logBusiness(businessId, business.ownerId, "BUSINESS_EMAIL_VERIFIED", context);
    return this.safeBusiness(updated);
  },

  async listMembers(businessId: string, userId: string) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, [BusinessMemberRole.OWNER, BusinessMemberRole.ADMINISTRATOR, BusinessMemberRole.MANAGER, BusinessMemberRole.VIEWER, BusinessMemberRole.MEMBER, BusinessMemberRole.DEVELOPER]);
    return prisma.businessMembership.findMany({
      where: { businessId, status: { not: BusinessMemberStatus.REMOVED } },
      select: { id: true, role: true, status: true, createdAt: true, updatedAt: true, user: { select: { id: true, username: true, fullName: true, displayName: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  },

  async invite(businessId: string, userId: string, input: { email: string; role: BusinessMemberRole }, context: Context) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, ownerAdmin);
    if (input.role === BusinessMemberRole.OWNER) throw AppError.badRequest("Use the ownership-transfer flow to assign an owner", "OWNER_TRANSFER_REQUIRED");
    if (membership.role === BusinessMemberRole.ADMINISTRATOR && input.role === BusinessMemberRole.ADMINISTRATOR) {
      throw AppError.forbidden("Only the business owner can invite another administrator", "BUSINESS_PERMISSION_DENIED");
    }
    const email = input.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const existingMembership = await prisma.businessMembership.findUnique({ where: { businessId_userId: { businessId, userId: existingUser.id } } });
      if (existingMembership && existingMembership.status !== BusinessMemberStatus.REMOVED) throw AppError.conflict("This person is already a member of the business", "BUSINESS_MEMBER_EXISTS");
    }
    const prior = await prisma.businessInvitation.findFirst({ where: { businessId, email, status: BusinessInvitationStatus.PENDING, expiresAt: { gt: new Date() } } });
    if (prior) throw AppError.conflict("An active invitation already exists for this email address", "BUSINESS_INVITATION_EXISTS");
    const token = makeToken();
    const invitation = await prisma.businessInvitation.create({
      data: { businessId, email, role: input.role, tokenHash: tokenHash(token), invitedById: userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    await logBusiness(businessId, userId, "BUSINESS_MEMBER_INVITED", context, { invitationId: invitation.id, email, role: input.role });
    return { invitation, inviteToken: token };
  },

  async acceptInvitation(userId: string, token: string, context: Context) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw AppError.unauthorized();
    const invitation = await prisma.businessInvitation.findUnique({ where: { tokenHash: tokenHash(token) }, include: { business: true } });
    if (!invitation || invitation.status !== BusinessInvitationStatus.PENDING || invitation.expiresAt <= new Date() || invitation.business.status !== BusinessStatus.ACTIVE) {
      throw AppError.badRequest("This business invitation is invalid, revoked, or expired", "BUSINESS_INVITATION_INVALID");
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) throw AppError.forbidden("Sign in with the MAX Account invited at this email address", "BUSINESS_INVITATION_EMAIL_MISMATCH");
    const result = await prisma.$transaction(async (tx) => {
      const updatedInvitation = await tx.businessInvitation.updateMany({
        where: { id: invitation.id, status: BusinessInvitationStatus.PENDING, expiresAt: { gt: new Date() } },
        data: { status: BusinessInvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });
      if (updatedInvitation.count !== 1) throw AppError.conflict("This invitation has already been used", "BUSINESS_INVITATION_ALREADY_USED");
      const member = await tx.businessMembership.upsert({
        where: { businessId_userId: { businessId: invitation.businessId, userId } },
        create: { businessId: invitation.businessId, userId, role: invitation.role, status: BusinessMemberStatus.ACTIVE },
        update: { role: invitation.role, status: BusinessMemberStatus.ACTIVE },
      });
      await tx.businessAuditLog.create({ data: { businessId: invitation.businessId, actorId: userId, action: "BUSINESS_INVITATION_ACCEPTED", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { invitationId: invitation.id, role: invitation.role } } });
      return member;
    });
    return { membership: result, business: this.safeBusiness(invitation.business) };
  },

  async revokeInvitation(businessId: string, invitationId: string, userId: string, context: Context) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, ownerAdmin);
    const result = await prisma.businessInvitation.updateMany({
      where: { id: invitationId, businessId, status: BusinessInvitationStatus.PENDING },
      data: { status: BusinessInvitationStatus.REVOKED, revokedAt: new Date() },
    });
    if (!result.count) throw AppError.notFound("Pending invitation not found", "BUSINESS_INVITATION_NOT_FOUND");
    await logBusiness(businessId, userId, "BUSINESS_INVITATION_REVOKED", context, { invitationId });
    return { revoked: true };
  },

  async updateMember(businessId: string, membershipId: string, userId: string, role: BusinessMemberRole, context: Context) {
    const actor = await membershipFor(businessId, userId);
    requireRole(actor.role, ownerAdmin);
    const target = await prisma.businessMembership.findFirst({ where: { id: membershipId, businessId, status: { not: BusinessMemberStatus.REMOVED } } });
    if (!target) throw AppError.notFound("Business member not found", "BUSINESS_MEMBER_NOT_FOUND");
    if (target.role === BusinessMemberRole.OWNER || role === BusinessMemberRole.OWNER) throw AppError.badRequest("Use the ownership-transfer flow to change the owner", "OWNER_TRANSFER_REQUIRED");
    if (actor.role !== BusinessMemberRole.OWNER && (target.role === BusinessMemberRole.ADMINISTRATOR || role === BusinessMemberRole.ADMINISTRATOR)) throw AppError.forbidden("Only the owner can manage administrator roles", "BUSINESS_PERMISSION_DENIED");
    const updated = await prisma.$transaction(async (tx) => {
      const member = await tx.businessMembership.update({ where: { id: membershipId }, data: { role } });
      await tx.oAuthAccessToken.updateMany({ where: { businessId, userId: target.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.oAuthRefreshToken.updateMany({ where: { businessId, userId: target.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.businessAuditLog.create({ data: { businessId, actorId: userId, action: "BUSINESS_MEMBER_ROLE_CHANGED", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { membershipId, role } } });
      return member;
    });
    return updated;
  },

  async removeMember(businessId: string, membershipId: string, userId: string, context: Context) {
    const actor = await membershipFor(businessId, userId);
    requireRole(actor.role, ownerAdmin);
    const target = await prisma.businessMembership.findFirst({ where: { id: membershipId, businessId, status: { not: BusinessMemberStatus.REMOVED } } });
    if (!target) throw AppError.notFound("Business member not found", "BUSINESS_MEMBER_NOT_FOUND");
    if (target.role === BusinessMemberRole.OWNER) throw AppError.badRequest("The final owner cannot be removed. Transfer ownership first.", "BUSINESS_OWNER_REQUIRED");
    if (actor.role !== BusinessMemberRole.OWNER && target.role === BusinessMemberRole.ADMINISTRATOR) throw AppError.forbidden("Only the owner can remove an administrator", "BUSINESS_PERMISSION_DENIED");
    const updated = await prisma.$transaction(async (tx) => {
      const member = await tx.businessMembership.update({ where: { id: membershipId }, data: { status: BusinessMemberStatus.REMOVED } });
      await tx.oAuthAccessToken.updateMany({ where: { businessId, userId: target.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.oAuthRefreshToken.updateMany({ where: { businessId, userId: target.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.businessAuditLog.create({ data: { businessId, actorId: userId, action: "BUSINESS_MEMBER_REMOVED", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { membershipId } } });
      return member;
    });
    return updated;
  },

  async transferOwnership(businessId: string, targetMembershipId: string, userId: string, context: Context) {
    const actor = await membershipFor(businessId, userId);
    requireRole(actor.role, [BusinessMemberRole.OWNER]);
    const target = await prisma.businessMembership.findFirst({ where: { id: targetMembershipId, businessId, status: BusinessMemberStatus.ACTIVE } });
    if (!target) throw AppError.notFound("Active business member not found", "BUSINESS_MEMBER_NOT_FOUND");
    if (target.userId === userId) throw AppError.badRequest("You already own this business", "ALREADY_BUSINESS_OWNER");
    await prisma.$transaction(async (tx) => {
      await tx.business.update({ where: { id: businessId }, data: { ownerId: target.userId } });
      await tx.businessMembership.update({ where: { id: actor.id }, data: { role: BusinessMemberRole.ADMINISTRATOR } });
      await tx.businessMembership.update({ where: { id: target.id }, data: { role: BusinessMemberRole.OWNER } });
      await tx.businessAppConnection.updateMany({ where: { businessId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
      await tx.oAuthAccessToken.updateMany({ where: { businessId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.oAuthRefreshToken.updateMany({ where: { businessId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.businessAuditLog.create({ data: { businessId, actorId: userId, action: "BUSINESS_OWNERSHIP_TRANSFERRED", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { fromUserId: userId, toUserId: target.userId } } });
    });
    return { transferred: true };
  },

  async listApps(businessId: string, userId: string) {
    await membershipFor(businessId, userId);
    return prisma.businessAppConnection.findMany({
      where: { businessId, status: "ACTIVE" },
      include: {
        client: { select: { clientId: true, name: true, isActive: true } },
        authorizedBy: { select: { id: true, username: true, displayName: true, email: true } },
      },
      orderBy: { connectedAt: "desc" },
    });
  },

  async revokeApp(businessId: string, connectionId: string, userId: string, context: Context) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, ownerAdmin);
    const connection = await prisma.businessAppConnection.findFirst({ where: { id: connectionId, businessId, status: "ACTIVE" } });
    if (!connection) throw AppError.notFound("Connected MAX product not found", "BUSINESS_APP_NOT_FOUND");
    await prisma.$transaction(async (tx) => {
      await tx.businessAppConnection.update({ where: { id: connectionId }, data: { status: "REVOKED", revokedAt: new Date() } });
      await tx.oAuthAccessToken.updateMany({ where: { businessId, clientId: connection.clientId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.oAuthRefreshToken.updateMany({ where: { businessId, clientId: connection.clientId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.oAuthAuthorizationCode.deleteMany({ where: { businessId, clientId: connection.clientId } });
      await tx.businessAuditLog.create({ data: { businessId, actorId: userId, action: "BUSINESS_APP_DISCONNECTED", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { clientId: connection.clientId, connectionId } } });
    });
    return { disconnected: true };
  },

  async listAuditLogs(businessId: string, userId: string) {
    const membership = await membershipFor(businessId, userId);
    requireRole(membership.role, ownerAdmin);
    return prisma.businessAuditLog.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 100 });
  },
};
