import { NextFunction, Request, Response } from "express";
import { authenticate } from "./authenticate";
import { oauthService } from "../services/oauth.service";
import { AppError } from "../utils/AppError";

/**
 * Profile endpoints accept both first-party MAX Auth session JWTs and OAuth
 * access tokens. OAuth writes require the dedicated profile:write permission.
 */
export async function authenticateProfile(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return authenticate(req, res, next);

  try {
    const oauth = await oauthService.introspect(token);
    if (!oauth.active) return authenticate(req, res, next);

    const canRead = oauth.scopes.includes("profile") ||
      oauth.scopes.includes("profile:read") ||
      oauth.scopes.includes("profile:write");
    const canWrite = oauth.scopes.includes("profile:write");

    if (req.method === "GET" && !canRead) {
      return next(AppError.forbidden("This application has not been granted permission to read your MAX profile.", "INSUFFICIENT_SCOPE"));
    }
    if (req.method !== "GET" && !canWrite) {
      return next(AppError.forbidden("Updating your MAX profile requires the profile:write permission. Reconnect MAX Chat and approve this permission.", "INSUFFICIENT_SCOPE"));
    }

    req.user = {
      sub: oauth.user.id,
      username: oauth.user.username,
      tier: "FREE",
      displayName: oauth.user.displayName,
      sessionId: "oauth:" + oauth.client_id,
      type: "access"
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
