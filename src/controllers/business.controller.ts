import { Request, Response, NextFunction } from "express";
import { businessService } from "../services/business.service";
import { mailService } from "../services/mail.service";
import { ok } from "../utils/response";
import { prisma } from "../database/prisma";

function context(req: Request) {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

export const businessController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { businesses: await businessService.listForUser(req.user!.sub) }); } catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { business, verificationToken } = await businessService.create(req.user!.sub, req.body, context(req));
      let emailVerificationSent = true;
      const verificationUrl = `https://api.max-ai.name.ng/business/verify-email?businessId=${encodeURIComponent(business.id)}&token=${encodeURIComponent(verificationToken)}`;
      try {
        await mailService.send({
          to: business.email,
          subject: "Verify your business email for MAX",
          text: `Your business identity ${business.displayName} has been created. Verify this email within 24 hours: ${verificationUrl}\n\nThis verifies control of the email address only; it does not certify legal business registration.`,
          html: `<p>Your business identity <strong>${business.displayName.replace(/[&<>"]/g, "")}</strong> has been created.</p><p><a href="${verificationUrl}">Verify business email</a></p><p>This verifies control of the email address only; it does not certify legal business registration. The link expires in 24 hours.</p>`,
        });
      } catch {
        emailVerificationSent = false;
      }
      let adminNotificationSent = false;
      try {
        const admin = await prisma.user.findUnique({ where: { username: "zionopaaje" }, select: { email: true, isAdmin: true } });
        if (admin?.email) {
          await mailService.send({
            to: admin.email,
            subject: `Organisation review required: ${business.displayName}`,
            text: `A new organisation has registered for MAX and is awaiting TTFL review.\n\nOrganisation: ${business.displayName}\nLegal name: ${business.legalName}\nMAX Business ID: ${business.businessId}\nAddress: ${business.address || "Not provided"}\nBusiness email: ${business.email}\nPhone: ${business.phone}\nCountry: ${business.country}\nType: ${business.businessType}\nRegistration number: ${business.registrationNumber || "Not provided"}\nOwner username: zionopaaje account owner is the notification recipient.\n\nReview organisation: https://api.max-ai.name.ng/admin/organisations\n\nBusiness email verification confirms mailbox control only; it does not approve the organisation.`,
            html: `<h2>New organisation awaiting review</h2><p>A new organisation has registered for MAX and needs review by The Tron Forge Limited.</p><ul><li><strong>Organisation:</strong> ${business.displayName.replace(/[&<>"]/g, "")}</li><li><strong>Legal name:</strong> ${business.legalName.replace(/[&<>"]/g, "")}</li><li><strong>MAX Business ID:</strong> ${business.businessId}</li><li><strong>Address:</strong> ${(business.address || "Not provided").replace(/[&<>"]/g, "")}</li><li><strong>Business email:</strong> ${business.email}</li><li><strong>Phone:</strong> ${business.phone}</li><li><strong>Country:</strong> ${business.country}</li><li><strong>Type:</strong> ${business.businessType.replace(/[&<>"]/g, "")}</li><li><strong>Registration number:</strong> ${(business.registrationNumber || "Not provided").replace(/[&<>"]/g, "")}</li></ul><p><a href="https://api.max-ai.name.ng/admin/organisations">Open the organisation review dashboard</a></p><p>Email verification does not constitute business approval.</p>`,
          });
          adminNotificationSent = true;
        }
      } catch { adminNotificationSent = false; }
      return ok(res, { business, emailVerificationSent, adminNotificationSent }, 201);
    } catch (err) { next(err); }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { business: await businessService.get(req.params.businessId, req.user!.sub) }); } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await businessService.update(req.params.businessId, req.user!.sub, req.body, context(req));
      let emailVerificationSent = true;
      if (result.verificationToken) {
        const verificationUrl = `https://api.max-ai.name.ng/business/verify-email?businessId=${encodeURIComponent(result.business.id)}&token=${encodeURIComponent(result.verificationToken)}`;
        try {
          await mailService.send({
            to: result.business.email,
            subject: "Verify your updated business email for MAX",
            text: `Verify the new business email address within 24 hours: ${verificationUrl}\n\nThis verifies control of the email address only.`,
            html: `<p>Verify your new business email address.</p><p><a href="${verificationUrl}">Verify business email</a></p><p>This link expires in 24 hours and does not certify legal registration.</p>`,
          });
        } catch { emailVerificationSent = false; }
      }
      return ok(res, { business: result.business, ...(result.verificationToken ? { emailVerificationSent } : {}) });
    } catch (err) { next(err); }
  },

  async resendEmailVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await businessService.resendEmailVerification(req.params.businessId, req.user!.sub, context(req));
      const verificationUrl = `https://api.max-ai.name.ng/business/verify-email?businessId=${encodeURIComponent(result.business.id)}&token=${encodeURIComponent(result.verificationToken)}`;
      let emailVerificationSent = true;
      try {
        await mailService.send({
          to: result.business.email,
          subject: "Verify your business email for MAX",
          text: `Verify your business email within 24 hours: ${verificationUrl}\n\nThis verifies control of the email address only.`,
          html: `<p>Verify your business email address.</p><p><a href="${verificationUrl}">Verify business email</a></p><p>This link expires in 24 hours and does not certify legal registration.</p>`,
        });
      } catch { emailVerificationSent = false; }
      return ok(res, { business: result.business, emailVerificationSent });
    } catch (err) { next(err); }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { business: await businessService.verifyEmail(req.params.businessId, req.body.token, context(req)) }); } catch (err) { next(err); }
  },

  async members(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { members: await businessService.listMembers(req.params.businessId, req.user!.sub) }); } catch (err) { next(err); }
  },

  async invite(req: Request, res: Response, next: NextFunction) {
    try {
      const { invitation, inviteToken } = await businessService.invite(req.params.businessId, req.user!.sub, req.body, context(req));
      const acceptUrl = `https://api.max-ai.name.ng/business/invitations/accept?token=${encodeURIComponent(inviteToken)}`;
      let emailSent = true;
      try {
        await mailService.send({
          to: invitation.email,
          subject: `Invitation to join ${(await businessService.get(req.params.businessId, req.user!.sub)).displayName} on MAX`,
          text: `You have been invited to join a business on MAX with the role ${invitation.role}. Sign in to the MAX Account that uses this email address and accept the invitation: ${acceptUrl}\n\nThis invitation expires in seven days.`,
          html: `<p>You have been invited to join a business on MAX with the role <strong>${invitation.role}</strong>.</p><p><a href="${acceptUrl}">Review invitation</a></p><p>Sign in with the MAX Account using this email address. This link expires in seven days.</p>`,
        });
      } catch { emailSent = false; }
      return ok(res, { invitation: { id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt }, acceptUrl, emailSent }, 201);
    } catch (err) { next(err); }
  },

  async acceptInvitation(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await businessService.acceptInvitation(req.user!.sub, req.body.token, context(req))); } catch (err) { next(err); }
  },

  async invitations(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { invitations: await businessService.listInvitations(req.params.businessId, req.user!.sub) }); } catch (err) { next(err); }
  },

  async revokeInvitation(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await businessService.revokeInvitation(req.params.businessId, req.params.invitationId, req.user!.sub, context(req))); } catch (err) { next(err); }
  },

  async updateMember(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { membership: await businessService.updateMember(req.params.businessId, req.params.membershipId, req.user!.sub, req.body.role, context(req)) }); } catch (err) { next(err); }
  },

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { membership: await businessService.removeMember(req.params.businessId, req.params.membershipId, req.user!.sub, context(req)) }); } catch (err) { next(err); }
  },

  async transferOwnership(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await businessService.transferOwnership(req.params.businessId, req.body.membershipId, req.user!.sub, context(req))); } catch (err) { next(err); }
  },

  async apps(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { apps: await businessService.listApps(req.params.businessId, req.user!.sub) }); } catch (err) { next(err); }
  },

  async revokeApp(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await businessService.revokeApp(req.params.businessId, req.params.connectionId, req.user!.sub, context(req))); } catch (err) { next(err); }
  },

  async auditLogs(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { logs: await businessService.listAuditLogs(req.params.businessId, req.user!.sub) }); } catch (err) { next(err); }
  },
};
