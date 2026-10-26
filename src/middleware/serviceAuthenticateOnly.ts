import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

/** Authenticates MAX backend service calls that do not yet know a MAX user ID. */
export function authenticateMaxServiceOnly(req: Request, _res: Response, next: NextFunction) {
  const supplied = req.headers["x-max-auth-service-token"];
  const expected = env.MAX_AUTH_SERVICE_TOKEN;
  if (typeof supplied !== "string" || !expected) {
    return next(AppError.unauthorized("Invalid MAX service authorization", "SERVICE_UNAUTHORIZED"));
  }
  const left = Buffer.from(supplied, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return next(AppError.unauthorized("Invalid MAX service authorization", "SERVICE_UNAUTHORIZED"));
  }
  next();
}
