import { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { ok } from "../utils/response";
import { mailService } from "../services/mail.service";
import { auditService } from "../services/audit.service";
import type { AdminPermission } from "../middleware/requireAdminPermission";

const PERMISSIONS: AdminPermission[] = [
  "user_management", "admin_management", "organisation_review", "beta_management",
  "system_diagnostics", "broadcast_management", "security_management",
];
const safeAdmin = (record: any) => ({
  userId: record.user.id, username: record.user.username,
  fullName: record.user.fullName, displayName: record.user.displayName,
  email: record.user.email, role: record.role, permissions: record.permissions,
  fullAccess: record.fullAccess, isActive: record.isActive,
  createdAt: record.createdAt, updatedAt: record.updatedAt,
});

async function actorAccess(actorId: string) {
  const access = await prisma.adminAccess.findUnique({ where: { userId: actorId } });
  if (!access || !access.isActive) throw AppError.forbidden("Active administrator access required");
  return access;
}

export const adminManagementController = {
  async listAdministrators(req: Request, res: Response, next: NextFunction) {
    try {
      const records = await prisma.adminAccess.findMany({
        where: { isActive: true },
        include: { user: { select: { id: true, username: true, fullName: true, displayName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      const currentAccess = await actorAccess(req.user!.sub);
      return ok(res, { administrators: records.map(safeAdmin), availablePermissions: PERMISSIONS, currentAccess: { fullAccess: currentAccess.fullAccess, permissions: currentAccess.permissions } });
    } catch (error) { next(error); }
  },

  async grantAdministrator(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const actor = await actorAccess(actorId);
      const username = String(req.body.username || "").trim();
      const role = String(req.body.role || "CUSTOM_ADMIN").trim().slice(0, 40);
      const permissions: string[] = Array.isArray(req.body.permissions) ? [...new Set((req.body.permissions as unknown[]).filter((item): item is string => typeof item === "string"))] : [];
      const fullAccess = req.body.fullAccess === true;
      if (fullAccess && !actor.fullAccess) throw AppError.forbidden("Only a full-access administrator can grant full access");
      if (permissions.some((item: string) => !PERMISSIONS.includes(item as AdminPermission))) throw AppError.badRequest("One or more permissions are invalid");
      if (!actor.fullAccess && (permissions.some((item: string) => !actor.permissions.includes(item)) || fullAccess)) {
        throw AppError.forbidden("You cannot grant permissions you do not hold");
      }
      const target = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true, username: true, isAdmin: true, status: true } });
      if (!target) throw AppError.notFound("No MAX user found with that username");
      if (target.status !== "ACTIVE") throw AppError.badRequest("Suspended or inactive accounts cannot become administrators");
      if (target.id === actorId) throw AppError.badRequest("You cannot change your own administrator assignment here");
      if (target.username.toLowerCase() === "zionopaaje") throw AppError.forbidden("The primary owner assignment is protected");
      if (role === "SUPER_ADMIN" && !fullAccess) throw AppError.badRequest("The Super Admin role requires full access");
      const record = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { isAdmin: true } });
        return tx.adminAccess.upsert({
          where: { userId: target.id },
          create: { userId: target.id, grantedById: actorId, role, permissions: fullAccess ? [] : permissions, fullAccess, isActive: true },
          update: { grantedById: actorId, role, permissions: fullAccess ? [] : permissions, fullAccess, isActive: true },
          include: { user: { select: { id: true, username: true, fullName: true, displayName: true, email: true } } },
        });
      });
      await auditService.record("ADMIN_ACTION", { userId: target.id, metadata: { actorId, action: "ADMIN_ACCESS_GRANTED", role, permissions, fullAccess } });
      return ok(res, { administrator: safeAdmin(record) });
    } catch (error) { next(error); }
  },

  async updateAdministrator(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = req.user!.sub;
      const actor = await actorAccess(actorId);
      const targetId = req.params.userId;
      if (targetId === actorId) throw AppError.badRequest("You cannot modify your own administrator access");
      const current = await prisma.adminAccess.findUnique({ where: { userId: targetId }, include: { user: { select: { username: true } } } });
      if (!current) throw AppError.notFound("Administrator assignment not found");
      if (current.user.username.toLowerCase() === "zionopaaje") throw AppError.forbidden("The primary owner assignment is protected");
      if (!actor.fullAccess && (current.fullAccess || current.permissions.some(p => !actor.permissions.includes(p)))) {
        throw AppError.forbidden("You cannot modify an administrator with higher or different privileges");
      }
      if (req.body.revoke === true) {
        await prisma.$transaction([
          prisma.adminAccess.update({ where: { userId: targetId }, data: { isActive: false } }),
          prisma.user.update({ where: { id: targetId }, data: { isAdmin: false } }),
        ]);
        await auditService.record("ADMIN_ACTION", { userId: targetId, metadata: { actorId, action: "ADMIN_ACCESS_REVOKED" } });
        return ok(res, { revoked: true });
      }
      const permissions: string[] = Array.isArray(req.body.permissions) ? [...new Set((req.body.permissions as unknown[]).filter((item): item is string => typeof item === "string"))] : current.permissions;
      const fullAccess = req.body.fullAccess === true;
      if (fullAccess && !actor.fullAccess) throw AppError.forbidden("Only a full-access administrator can grant full access");
      if (permissions.some((p: string) => !PERMISSIONS.includes(p as AdminPermission))) throw AppError.badRequest("One or more permissions are invalid");
      if (!actor.fullAccess && permissions.some((p: string) => !actor.permissions.includes(p))) throw AppError.forbidden("You cannot grant permissions you do not hold");
      const nextRole = String(req.body.role || current.role).slice(0, 40);
      if (nextRole === "SUPER_ADMIN" && !fullAccess) throw AppError.badRequest("The Super Admin role requires full access");
      const updated = await prisma.adminAccess.update({
        where: { userId: targetId },
        data: { role: fullAccess ? "SUPER_ADMIN" : nextRole, permissions: fullAccess ? [] : permissions, fullAccess, isActive: true },
        include: { user: { select: { id: true, username: true, fullName: true, displayName: true, email: true } } },
      });
      await auditService.record("ADMIN_ACTION", { userId: targetId, metadata: { actorId, action: "ADMIN_ACCESS_UPDATED", role: updated.role, permissions: updated.permissions, fullAccess } });
      return ok(res, { administrator: safeAdmin(updated) });
    } catch (error) { next(error); }
  },

  async listBroadcasts(_req: Request, res: Response, next: NextFunction) {
    try {
      const broadcasts = await prisma.adminBroadcast.findMany({
        take: 50, orderBy: { createdAt: "desc" },
        include: { author: { select: { username: true } }, _count: { select: { recipients: true } } },
      });
      return ok(res, { broadcasts: broadcasts.map(item => ({
        id: item.id, title: item.title, body: item.body, audience: item.audience,
        author: item.author.username, recipientCount: item._count.recipients, createdAt: item.createdAt,
      })) });
    } catch (error) { next(error); }
  },

  async createBroadcast(req: Request, res: Response, next: NextFunction) {
    try {
      const authorId = req.user!.sub;
      const title = String(req.body.title || "").trim();
      const body = String(req.body.body || "").trim();
      const audience = req.body.audience === "ALL" ? "ALL" : "SELECTED";
      if (title.length < 3 || title.length > 180 || !body || body.length > 12000) throw AppError.badRequest("Provide a title (3–180 characters) and message (up to 12,000 characters)");
      let users;
      if (audience === "ALL") {
        users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, username: true, email: true, displayName: true } });
      } else {
        const usernames: string[] = Array.isArray(req.body.usernames) ? [...new Set((req.body.usernames as unknown[]).filter((u): u is string => typeof u === "string").map(u => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))] : [];
        if (!usernames.length || usernames.length > 500) throw AppError.badRequest("Enter between 1 and 500 usernames");
        users = await prisma.user.findMany({ where: { username: { in: usernames }, status: "ACTIVE" }, select: { id: true, username: true, email: true, displayName: true } });
        const found = new Set(users.map(user => user.username.toLowerCase()));
        const missing = usernames.filter(name => !found.has(name));
        if (missing.length) throw AppError.badRequest("Some usernames were not found or are inactive", "BROADCAST_RECIPIENTS_INVALID", { usernames: missing });
      }
      if (!users.length) throw AppError.badRequest("There are no eligible recipients");
      const broadcast = await prisma.adminBroadcast.create({
        data: { title, body, audience, authorId, recipients: { create: users.map(user => ({ userId: user.id })) } },
        select: { id: true, title: true, createdAt: true },
      });
      let emailSent = 0;
      let emailFailed = 0;
      for (const recipient of users) {
        try {
          await mailService.send({
            to: recipient.email, subject: title,
            text: `Hi ${recipient.displayName || recipient.username},\n\n${body}\n\nYou received this message from MAX Auth.`,
          });
          await prisma.adminBroadcastRecipient.update({ where: { broadcastId_userId: { broadcastId: broadcast.id, userId: recipient.id } }, data: { emailSentAt: new Date() } });
          emailSent++;
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 900) : "Email delivery failed";
          await prisma.adminBroadcastRecipient.update({ where: { broadcastId_userId: { broadcastId: broadcast.id, userId: recipient.id } }, data: { emailError: message } });
          emailFailed++;
        }
      }
      await auditService.record("ADMIN_ACTION", { userId: authorId, metadata: { action: "ADMIN_BROADCAST_SENT", broadcastId: broadcast.id, audience, recipientCount: users.length, emailSent, emailFailed } });
      return ok(res, { broadcast: { ...broadcast, recipientCount: users.length, emailSent, emailFailed } });
    } catch (error) { next(error); }
  },
};
