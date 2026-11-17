import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

/**
 * SameSite cookies are scoped to the registrable domain, not individual MAX
 * subdomains. Validate browser Origin on refresh so an untrusted sibling
 * subdomain cannot trigger refresh-token rotation with the host-only cookie.
 * Non-browser clients that do not send Origin remain supported.
 */
export function requireAllowedRefreshOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if (origin && !env.CORS_ALLOWED_ORIGINS.includes(origin)) {
    return next(AppError.forbidden("This origin is not allowed to refresh a MAX Auth session.", "REFRESH_ORIGIN_NOT_ALLOWED"));
  }
  if (!origin && fetchSite && fetchSite !== "same-origin") {
    return next(AppError.forbidden("Cross-origin refresh requests are not allowed.", "REFRESH_ORIGIN_NOT_ALLOWED"));
  }
  return next();
}
