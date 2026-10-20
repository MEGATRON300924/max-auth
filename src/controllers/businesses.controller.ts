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
};
