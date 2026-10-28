import { prisma } from "../database/prisma";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { mailService } from "./mail.service";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

type MinorAgeGroup = "UNDER_16" | "AGE_16_17";

function digest(rawToken: string) {
  return hashToken(rawToken);
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character] || character);
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email address";
  return `${local.slice(0, 1)}•••@${domain}`;
}

export const familyService = {
  async createParentalConsentRequest(input: { childUserId: string; childName: string; parentEmail: string; ageGroup: MinorAgeGroup }) {
    const token = generateOpaqueToken();
    const tokenHash = digest(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const parentEmail = input.parentEmail.trim().toLowerCase();
    const existing = await prisma.familyConsentRequest.findUnique({ where: { childUserId: input.childUserId } });
    if (existing) {
      await prisma.familyConsentRequest.update({
        where: { childUserId: input.childUserId },
        data: { parentEmail, ageGroup: input.ageGroup, tokenHash, status: "PENDING", expiresAt, approvedAt: null, rejectedAt: null, parentUserId: null }
      });
    } else {
      await prisma.familyConsentRequest.create({
        data: { childUserId: input.childUserId, parentEmail, ageGroup: input.ageGroup, tokenHash, expiresAt }
      });
    }

    const approvalUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/parental-approval?token=${encodeURIComponent(token)}`;
    const almostEighteen = input.ageGroup === "AGE_16_17";
    const childLabel = input.childName.trim() || "A child";
    const intro = almostEighteen
      ? `${childLabel} is 16–17 and is requesting a MAX Account. Some services may remain restricted until they turn 18.`
      : `${childLabel} is requesting a MAX Account and needs parent or guardian approval.`;
    const introHtml = escapeHtml(intro);
    await mailService.send({
      to: parentEmail,
      subject: "Your child's MAX Account needs your approval",
      text: `${intro}\n\nReview the request securely: ${approvalUrl}\n\nThis link expires in 7 days. If you do not recognise this request, you can ignore this email.`,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f7fb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033"><main style="max-width:560px;margin:0 auto;padding:28px 16px"><section style="background:#fff;border:1px solid #e4e8f0;border-radius:22px;overflow:hidden"><header style="padding:30px 28px 16px;text-align:center"><img src="https://api.max-ai.name.ng/logo.png" width="52" height="52" alt="MAX Auth" style="display:block;margin:0 auto 14px;border-radius:14px"><p style="margin:0;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:2px">MAX FAMILY</p><h1 style="margin:12px 0 8px;font-size:25px;line-height:1.25;color:#111827">Your child's account needs approval</h1><p style="margin:0;color:#5b6475;font-size:15px;line-height:1.7">${introHtml}</p></header><div style="padding:12px 28px 30px"><a href="${approvalUrl}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:600;padding:15px 20px;border-radius:12px">Review approval request</a><p style="margin:20px 0 0;color:#7b8494;font-size:12px;line-height:1.7">This secure link expires in 7 days. If you did not expect this request, you can ignore this message. Email access alone does not independently verify age; please approve only if you are the child's parent or legal guardian.</p></div></section><p style="margin:18px 8px 0;text-align:center;color:#7b8494;font-size:12px">The MAX AI Ecosystem · One account across MAX.</p></main></body></html>`
    });
    return { expiresAt, parentEmail: maskEmail(parentEmail) };
  },

  async getRequest(rawToken: string) {
    const record = await prisma.familyConsentRequest.findUnique({
      where: { tokenHash: digest(rawToken) },
      include: { childUser: { select: { displayName: true, fullName: true, username: true } } }
    });
    if (!record || record.status !== "PENDING" || record.expiresAt <= new Date()) {
      if (record && record.status === "PENDING" && record.expiresAt <= new Date()) {
        await prisma.familyConsentRequest.update({ where: { id: record.id }, data: { status: "EXPIRED" } }).catch(() => undefined);
      }
      throw AppError.badRequest("This approval link is invalid, expired, or already used.", "PARENTAL_APPROVAL_LINK_INVALID");
    }
    const childName = record.childUser.displayName || record.childUser.fullName || record.childUser.username;
    return { childName, ageGroup: record.ageGroup, expiresAt: record.expiresAt, parentEmail: maskEmail(record.parentEmail) };
  },

  async approve(rawToken: string, options: { parentUserId?: string; parentEmail?: string; guardianAttestation: boolean }) {
    if (!options.guardianAttestation) throw AppError.badRequest("Confirm that you are the child's parent or legal guardian.", "GUARDIAN_ATTESTATION_REQUIRED");
    const tokenHash = digest(rawToken);
    const record = await prisma.familyConsentRequest.findUnique({ where: { tokenHash } });
    if (!record || record.status !== "PENDING" || record.expiresAt <= new Date()) {
      throw AppError.badRequest("This approval link is invalid, expired, or already used.", "PARENTAL_APPROVAL_LINK_INVALID");
    }
    if (options.parentUserId) {
      if (!options.parentEmail || options.parentEmail.trim().toLowerCase() !== record.parentEmail.toLowerCase()) {
        throw AppError.forbidden("Sign in with the MAX Auth account that matches the guardian email address.", "GUARDIAN_EMAIL_MISMATCH");
      }
    }
    await prisma.$transaction(async (tx) => {
      const current = await tx.familyConsentRequest.findUnique({ where: { id: record.id } });
      if (!current || current.status !== "PENDING" || current.expiresAt <= new Date()) {
        throw AppError.badRequest("This approval request has already been handled or expired.", "PARENTAL_APPROVAL_LINK_INVALID");
      }
      await tx.familyConsentRequest.update({
        where: { id: current.id },
        data: { status: "APPROVED", approvedAt: new Date(), parentUserId: options.parentUserId ?? null }
      });
      await tx.user.update({ where: { id: current.childUserId }, data: { status: "ACTIVE" } });
    });
    return { approved: true, childUserId: record.childUserId };
  },

  async decline(rawToken: string, guardianAttestation: boolean) {
    if (!guardianAttestation) throw AppError.badRequest("Confirm that you are the child's parent or legal guardian.", "GUARDIAN_ATTESTATION_REQUIRED");
    const record = await prisma.familyConsentRequest.findUnique({ where: { tokenHash: digest(rawToken) } });
    if (!record || record.status !== "PENDING" || record.expiresAt <= new Date()) {
      throw AppError.badRequest("This approval link is invalid, expired, or already used.", "PARENTAL_APPROVAL_LINK_INVALID");
    }
    await prisma.$transaction(async (tx) => {
      await tx.familyConsentRequest.update({ where: { id: record.id }, data: { status: "REJECTED", rejectedAt: new Date() } });
      await tx.user.update({ where: { id: record.childUserId }, data: { status: "DEACTIVATED" } });
    });
    return { declined: true };
  }
};
