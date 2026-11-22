import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { prisma } from "../database/prisma";

export type AdminPermission =
  | "user_management"
  | "admin_management"
  | "organisation_review"
  | "beta_management"
  | "system_diagnostics"
  | "broadcast_management"
  | "security_management";

export async function requireAdminPermission(permission: AdminPermission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthorized());
      const admin = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { isAdmin: true, status: true, adminAccess: { select: { permissions: true, fullAccess: true, isActive: true } } },
      });
      if (!admin || !admin.isAdmin || admin.status !== "ACTIVE" || !admin.adminAccess?.isActive) {
        return next(AppError.forbidden("Active administrator access required"));
      }
      if (admin.adminAccess.fullAccess || admin.adminAccess.permissions.includes(permission)) return next();
      return next(AppError.forbidden("You do not have permission to perform this action", "ADMIN_PERMISSION_REQUIRED"));
    } catch (error) {
      next(error);
    }
  };
}
