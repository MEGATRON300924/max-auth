import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Authenticates trusted MAX backend-to-MAX Auth requests.
 * This is intentionally separate from end-user JWT authentication.
 */
export function authenticateMaxService(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers["x-max-auth-service-token"];
  if (typeof token !== "string" || !env.MAX_AUTH_SERVICE_TOKEN || !safeEqual(token, env.MAX_AUTH_SERVICE_TOKEN)) {
    return next(AppError.unauthorized("Invalid MAX service authorization", "SERVICE_UNAUTHORIZED"));
  }

  const requestedUserId = req.headers["x-max-user-id"];
  if (typeof requestedUserId !== "string" || requestedUserId !== req.params.userId) {
    return next(AppError.unauthorized("MAX user context is missing or invalid", "USER_CONTEXT_INVALID"));
  }

  next();
}
