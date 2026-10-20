import { NextFunction, Request, Response } from "express";
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
};