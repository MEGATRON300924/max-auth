import { Request, Response, NextFunction } from "express";
import { BetaApplicationStatus, BetaIssueStatus, BetaRole } from "@prisma/client";
import { prisma } from "../database/prisma";
import { mailService } from "../services/mail.service";
import { AppError } from "../utils/AppError";
import { ok } from "../utils/response";

const PROGRAM_ADMIN_USERNAME = "zionopaaje";
const PRODUCTS = [
  "MAX AI", "MAX Home", "MAX Music", "MAX Browser", "MAX TV", "MAX Cloud",
  "MAX Store", "MAX Connect", "MAX Car OS", "MAX Business", "MAX Security", "MAX OS",
  "MAX Pay", "MAX Studio", "MAX Voice", "MAX Spotlight Graph", "MAX Auth",
] as const;

async function requireProgramOwner(userId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, isAdmin: true } });
  if (!actor?.isAdmin || actor.username.toLowerCase() !== PROGRAM_ADMIN_USERNAME) {
    throw AppError.forbidden("Only the MAX Auth Beta programme owner can manage testers and announcements.");
  }
  return actor;
}

async function requireBetaTester(userId: string) {
  const role = await prisma.betaRoleAssignment.findUnique({ where: { userId_role: { userId, role: BetaRole.BETA_TESTER } }, select: { id: true } });
  if (!role) throw AppError.forbidden("An approved MAX Beta Tester role is required.");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function notifyIssueReportOwner(reportId: string, title: string, product: string, severity: string, source: string) {
  try {
    const owner = await prisma.user.findUnique({ where: { username: PROGRAM_ADMIN_USERNAME }, select: { email: true } });
    if (owner?.email) await mailService.send({ to: owner.email, subject: `New MAX issue report: ${title}`, text: `A new issue report was submitted from ${source}. Product: ${product}. Severity: ${severity}. Report ID: ${reportId}. Review it at https://api.max-ai.name.ng/admin/beta.` });
  } catch { /* The report is persisted even if email delivery fails. */ }
}

import { Request, Response, NextFunction } from "express";
import { BetaApplicationStatus, BetaIssueStatus, BetaRole } from "@prisma/client";
import { prisma } from "../database/prisma";
import { mailService } from "../services/mail.service";
import { AppError } from "../utils/AppError";
import { ok } from "../utils/response";

const PROGRAM_ADMIN_USERNAME = "zionopaaje";
const PRODUCTS = [
  "MAX AI", "MAX Home", "MAX Music", "MAX Browser", "MAX TV", "MAX Cloud",
  "MAX Store", "MAX Connect", "MAX Car OS", "MAX Business", "MAX Security", "MAX OS",
  "MAX Pay", "MAX Studio", "MAX Voice", "MAX Spotlight Graph", "MAX Auth",
] as const;

async function requireProgramOwner(userId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, isAdmin: true } });
  if (!actor?.isAdmin || actor.username.toLowerCase() !== PROGRAM_ADMIN_USERNAME) {
    throw AppError.forbidden("Only the MAX Auth Beta programme owner can manage testers and announcements.");
  }
  return actor;
}

async function requireBetaTester(userId: string) {
  const role = await prisma.betaRoleAssignment.findUnique({ where: { userId_role: { userId, role: BetaRole.BETA_TESTER } }, select: { id: true } });
  if (!role) throw AppError.forbidden("An approved MAX Beta Tester role is required.");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}


async function notifyIssueReportOwner(reportId: string, title: string, product: string, severity: string, source: string) {
  try {
    const owner = await prisma.user.findUnique({ where: { username: PROGRAM_ADMIN_USERNAME }, select: { email: true } });
    if (owner?.email) await mailService.send({ to: owner.email, subject: `New MAX issue report: ${title}`, text: `A new issue report was submitted from ${source}. Product: ${product}. Severity: ${severity}. Report ID: ${reportId}. Review it at https://api.max-ai.name.ng/admin/beta.` });
  } catch { /* The report is persisted even if email delivery fails. */ }
}

export const betaController = {
  async submitIssueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      await requireBetaTester(userId);
      const report = await prisma.betaIssueReport.create({ data: {
        userId, source: "BETA_PORTAL", product: req.body.product, category: req.body.category,
        severity: req.body.severity, title: req.body.title.trim(), description: req.body.description.trim(),
        stepsToReproduce: req.body.stepsToReproduce?.trim() || null,
        expectedBehaviour: req.body.expectedBehaviour?.trim() || null,
        actualBehaviour: req.body.actualBehaviour?.trim() || null,
      } });
      await notifyIssueReportOwner(report.id, report.title, report.product, report.severity, "Beta Tester portal");
      return ok(res, { report }, 201);
    } catch (error) { next(error); }
  },

  async submitChatReport(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await prisma.betaIssueReport.create({ data: {
        userId: req.user!.sub, source: "MAX_WEBCHAT", product: req.body.product || "MAX AI",
        category: req.body.category, severity: req.body.severity, title: req.body.title.trim(),
        description: req.body.description.trim(), conversationId: req.body.conversationId || null,
        messageId: req.body.messageId || null, userMessage: req.body.userMessage || null,
        assistantResponse: req.body.assistantResponse || null, errorMessage: req.body.errorMessage || null,
        pageUrl: req.body.pageUrl || null, model: req.body.model || null,
        clientMetadata: req.body.clientMetadata || null,
      } });
      await notifyIssueReportOwner(report.id, report.title, report.product, report.severity, "MAX WebChat");
      return ok(res, { report: { id: report.id, status: report.status, createdAt: report.createdAt } }, 201);
    } catch (error) { next(error); }
  },

  async listMyIssueReports(req: Request, res: Response, next: NextFunction) {
    try {
      await requireBetaTester(req.user!.sub);
      const reports = await prisma.betaIssueReport.findMany({
        where: { userId: req.user!.sub, source: "BETA_PORTAL" },
        orderBy: { createdAt: "desc" }, take: 50,
        select: { id: true, product: true, category: true, severity: true, title: true, description: true, status: true, adminNote: true, createdAt: true, updatedAt: true },
      });
      return ok(res, { reports });
    } catch (error) { next(error); }
  },

  async listIssueReports(req: Request, res: Response, next: NextFunction) {
    try {
      await requireProgramOwner(req.user!.sub);
      const statuses = ["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"] as const;
      const sources = ["BETA_PORTAL", "MAX_WEBCHAT"] as const;
      const status = typeof req.query.status === "string" && statuses.includes(req.query.status as typeof statuses[number]) ? req.query.status as BetaIssueStatus : undefined;
      const source = typeof req.query.source === "string" && sources.includes(req.query.source as typeof sources[number]) ? req.query.source : undefined;
      const reports = await prisma.betaIssueReport.findMany({
        where: { ...(status ? { status } : {}), ...(source ? { source } : {}) },
        include: { user: { select: { id: true, username: true, email: true } }, reviewedBy: { select: { username: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200,
      });
      const counts = await Promise.all(statuses.map((value) => prisma.betaIssueReport.count({ where: { status: value } })));
      return ok(res, { reports, counts: { open: counts[0], triaged: counts[1], inProgress: counts[2], resolved: counts[3], wontFix: counts[4] } });
    } catch (error) { next(error); }
  },

  async updateIssueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = await requireProgramOwner(req.user!.sub);
      const report = await prisma.betaIssueReport.update({
        where: { id: req.params.reportId },
        data: { status: req.body.status, adminNote: req.body.adminNote?.trim() || null, reviewedById: actor.id, reviewedAt: new Date() },
      });
      return ok(res, { report });
    } catch (error) { next(error); }
  },


  async submitApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, verificationStatus: true } });
      if (!user || user.verificationStatus !== "VERIFIED") throw AppError.forbidden("Verify your MAX Account email before applying.");
      const existing = await prisma.betaApplication.findUnique({ where: { userId } });
      if (existing?.status === "APPROVED") throw AppError.conflict("You are already an approved Beta Tester.", "BETA_ALREADY_APPROVED");
      if (existing?.status === "PENDING") throw AppError.conflict("Your Beta Tester application is already awaiting review.", "BETA_APPLICATION_PENDING");
      const data = {
        fullName: String(req.body.fullName).trim(),
        devices: [...new Set((req.body.devices as string[]).map((item) => item.trim()))],
        products: [...new Set((req.body.products as string[]).map((item) => item.trim()))],
        status: BetaApplicationStatus.PENDING,
      };
      const application = existing
        ? await prisma.betaApplication.update({ where: { userId }, data: { ...data, reviewNote: null, reviewedAt: null, reviewedBy: null } })
        : await prisma.betaApplication.create({ data: { ...data, userId } });
      let adminEmailSent = false;
      try {
        const owner = await prisma.user.findUnique({ where: { username: PROGRAM_ADMIN_USERNAME }, select: { email: true } });
        if (owner?.email) {
          await mailService.send({
            to: owner.email,
            subject: "New MAX Beta Tester application",
            text: `A new Beta Tester application was submitted by ${data.fullName} (${user.email}). Devices: ${data.devices.join(", ")}. Products of interest: ${data.products.join(", ")}. Review it in MAX Auth at https://api.max-ai.name.ng/admin/beta.`,
            html: `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><h1>New Beta Tester application</h1><p><strong>Name:</strong> ${escapeHtml(data.fullName)}</p><p><strong>Email:</strong> ${escapeHtml(user.email)}</p><p><strong>Devices:</strong> ${escapeHtml(data.devices.join(", "))}</p><p><strong>Products:</strong> ${escapeHtml(data.products.join(", "))}</p><p><a href="https://api.max-ai.name.ng/admin/beta">Review in MAX Auth</a></p></main>`,
          });
          adminEmailSent = true;
        }
      } catch { adminEmailSent = false; }
      return ok(res, { application: { id: application.id, fullName: application.fullName, devices: application.devices, products: application.products, status: application.status, createdAt: application.createdAt }, adminEmailSent }, 201);
    } catch (error) { next(error); }
  },

  async getMyApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const application = await prisma.betaApplication.findUnique({ where: { userId: req.user!.sub }, select: { id: true, fullName: true, devices: true, products: true, status: true, reviewNote: true, createdAt: true, updatedAt: true } });
      const role = await prisma.betaRoleAssignment.findUnique({ where: { userId_role: { userId: req.user!.sub, role: BetaRole.BETA_TESTER } }, select: { role: true, grantedAt: true } });
      return ok(res, { application, role });
    } catch (error) { next(error); }
  },

  async listApplications(req: Request, res: Response, next: NextFunction) {
    try {
      await requireProgramOwner(req.user!.sub);
      const status = typeof req.query.status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(req.query.status) ? req.query.status as BetaApplicationStatus : undefined;
      const applications = await prisma.betaApplication.findMany({
        where: status ? { status } : undefined,
        include: { user: { select: { id: true, username: true, email: true, verificationStatus: true, createdAt: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
      });
      const counts = await Promise.all([
        prisma.betaApplication.count({ where: { status: "PENDING" } }),
        prisma.betaApplication.count({ where: { status: "APPROVED" } }),
        prisma.betaApplication.count({ where: { status: "REJECTED" } }),
      ]);
      return ok(res, { applications, counts: { pending: counts[0], approved: counts[1], rejected: counts[2] }, products: PRODUCTS });
    } catch (error) { next(error); }
  },

  async reviewApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = await requireProgramOwner(req.user!.sub);
      const status = req.body.status as BetaApplicationStatus;
      const application = await prisma.betaApplication.findUnique({ where: { id: req.params.applicationId }, include: { user: { select: { id: true, email: true, username: true } } } });
      if (!application) throw AppError.notFound("Beta Tester application not found.");
      if (application.status !== "PENDING") throw AppError.conflict("This application has already been reviewed.", "BETA_APPLICATION_ALREADY_REVIEWED");
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.betaApplication.update({ where: { id: application.id }, data: { status, reviewNote: req.body.note?.trim() || null, reviewedBy: actor.id, reviewedAt: new Date() } });
        if (status === "APPROVED") {
          await tx.betaRoleAssignment.upsert({
            where: { userId_role: { userId: application.userId, role: BetaRole.BETA_TESTER } },
            create: { userId: application.userId, role: BetaRole.BETA_TESTER, grantedBy: actor.id },
            update: { grantedBy: actor.id, grantedAt: new Date() },
          });
        }
        return result;
      });
      let emailSent = false;
      try {
        await mailService.send({
          to: application.user.email,
          subject: status === "APPROVED" ? "Your MAX Beta Tester application was approved" : "An update on your MAX Beta Tester application",
          text: status === "APPROVED"
            ? "Your application has been approved. Your MAX Account now has the global Beta Tester role."
            : `Your application was not approved at this time.${updated.reviewNote ? " Note: " + updated.reviewNote : ""}`,
        });
        emailSent = true;
      } catch { emailSent = false; }
      return ok(res, { application: updated, emailSent });
    } catch (error) { next(error); }
  },

  async listAnnouncements(req: Request, res: Response, next: NextFunction) {
    try {
      await requireProgramOwner(req.user!.sub);
      const announcements = await prisma.betaAnnouncement.findMany({
        include: { _count: { select: { notifications: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return ok(res, { announcements, products: PRODUCTS });
    } catch (error) { next(error); }
  },

  async createAnnouncement(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = await requireProgramOwner(req.user!.sub);
      const productReference = req.body.productReference as string;
      if (productReference !== "ALL_MAX_PRODUCTS" && !PRODUCTS.includes(productReference as typeof PRODUCTS[number])) {
        throw AppError.badRequest("Choose a valid MAX ecosystem product reference.");
      }
      const testers = await prisma.user.findMany({
        where: { status: "ACTIVE", betaRoleAssignments: { some: { role: BetaRole.BETA_TESTER } } },
        select: { id: true, email: true, username: true },
        orderBy: { createdAt: "asc" },
      });
      const announcement = await prisma.betaAnnouncement.create({
        data: { title: req.body.title.trim(), body: req.body.body.trim(), productReference, authorId: actor.id },
      });
      if (!testers.length) return ok(res, { announcement, recipientCount: 0, emailSent: 0, emailFailed: 0 });
      await prisma.betaNotification.createMany({ data: testers.map((tester) => ({ userId: tester.id, announcementId: announcement.id })) });
      let emailSent = 0;
      let emailFailed = 0;
      for (const tester of testers) {
        const notification = await prisma.betaNotification.findUnique({ where: { userId_announcementId: { userId: tester.id, announcementId: announcement.id } }, select: { id: true } });
        try {
          await mailService.send({
            to: tester.email,
            subject: announcement.title,
            text: `Product reference: ${productReference === "ALL_MAX_PRODUCTS" ? "All MAX Products" : productReference}\n\n${announcement.body}\n\nYou received this because your MAX Account is an approved global Beta Tester.`,
            html: `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em">MAX Beta Tester update</p><p><strong>Product reference:</strong> ${escapeHtml(productReference === "ALL_MAX_PRODUCTS" ? "All MAX Products" : productReference)}</p><h1 style="font-size:22px">${escapeHtml(announcement.title)}</h1><p>${escapeHtml(announcement.body).replace(/\n/g, "<br>")}</p><hr><p style="font-size:12px;color:#666">You received this because your MAX Account is an approved global Beta Tester.</p></main>`,
          });
          await prisma.betaNotification.update({ where: { id: notification!.id }, data: { emailSentAt: new Date(), emailError: null } });
          emailSent += 1;
        } catch (error) {
          await prisma.betaNotification.update({ where: { id: notification!.id }, data: { emailError: String(error).slice(0, 1000) } });
          emailFailed += 1;
        }
      }
      return ok(res, { announcement, recipientCount: testers.length, emailSent, emailFailed });
    } catch (error) { next(error); }
  },

  async listMyNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      await requireBetaTester(req.user!.sub);
      const notifications = await prisma.betaNotification.findMany({
        where: { userId: req.user!.sub },
        include: { announcement: { select: { id: true, title: true, body: true, productReference: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return ok(res, { notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
    } catch (error) { next(error); }
  },

  async markNotificationRead(req: Request, res: Response, next: NextFunction) {
    try {
      await requireBetaTester(req.user!.sub);
      const updated = await prisma.betaNotification.updateMany({
        where: { id: req.params.notificationId, userId: req.user!.sub, readAt: null },
        data: { readAt: new Date() },
      });
      if (!updated.count) throw AppError.notFound("Unread beta notification not found.");
      return ok(res, { read: true });
    } catch (error) { next(error); }
  },
};
