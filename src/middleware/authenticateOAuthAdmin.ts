import { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma";
import { oauthService } from "../services/oauth.service";
import { AppError } from "../utils/AppError";

const MAX_WEB_CLIENT_ID = "max_client_OHnbfpb_bEfwe1z9";

export async function authenticateOAuthAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return next(AppError.unauthorized("A MAX Account access token is required"));

    const session = await oauthService.introspect(token);
    if (!session.active || !session.user || session.client_id !== MAX_WEB_CLIENT_ID || !session.scopes.includes("openid")) {
      return next(AppError.unauthorized("The MAX website session is invalid or expired"));
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, username: true, isAdmin: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") return next(AppError.unauthorized("The MAX Account is not active"));
    if (!user.isAdmin) return next(AppError.forbidden("Administrator access required"));

    (req as Request & { maxAdmin?: { id: string; username: string } }).maxAdmin = {
      id: user.id,
      username: user.username,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
