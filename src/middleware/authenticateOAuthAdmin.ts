import { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma";
import { oauthService } from "../services/oauth.service";
import { verifyAccessToken } from "../security/jwt";
import { AppError } from "../utils/AppError";

const MAX_WEB_CLIENT_ID = "max_client_OHnbfpb_bEfwe1z9";

export async function authenticateOAuthAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return next(AppError.unauthorized("A MAX Account access token is required"));

    let userId = "";
    try {
      const payload = verifyAccessToken(token);
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { userId: true, isRevoked: true, expiresAt: true, user: { select: { status: true } } },
      });
      if (session && !session.isRevoked && session.expiresAt > new Date() &&
          session.userId === payload.sub && session.user.status === "ACTIVE") {
        userId = session.userId;
      }
    } catch {
      // OAuth access tokens are opaque; validate those through the OAuth token store below.
    }

    if (!userId) {
      const oauthSession = await oauthService.introspect(token);
      if (!oauthSession.active || !oauthSession.user ||
          oauthSession.client_id !== MAX_WEB_CLIENT_ID ||
          !oauthSession.scopes.includes("openid")) {
        return next(AppError.unauthorized("The MAX website session is invalid or expired"));
      }
      userId = oauthSession.user.id;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, isAdmin: true, status: true, adminAccess: { select: { permissions: true, fullAccess: true, isActive: true } } },
    });
    if (!user || user.status !== "ACTIVE") return next(AppError.unauthorized("The MAX Account is not active"));
    if (!user.isAdmin || !user.adminAccess?.isActive) return next(AppError.forbidden("Administrator access required"));
    if (!user.adminAccess.fullAccess && !user.adminAccess.permissions.includes("system_diagnostics")) {
      return next(AppError.forbidden("System diagnostics permission required", "ADMIN_PERMISSION_REQUIRED"));
    }

    (req as Request & { maxAdmin?: { id: string; username: string } }).maxAdmin = {
      id: user.id,
      username: user.username,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
