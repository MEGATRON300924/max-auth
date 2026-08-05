import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { prisma } from "../database/prisma";

/**
 * Must be used AFTER `authenticate`.
 * Confirms the authenticated user has isAdmin = true.
 */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) return next(AppError.unauthorized());

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { isAdmin: true, status: true },
    });

    if (!user || !user.isAdmin) {
      return next(AppError.forbidden("Administrator access required"));
    }
    next();
  } catch (err) {
    next(err);
  }
}
