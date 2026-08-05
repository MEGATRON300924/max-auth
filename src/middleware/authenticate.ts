import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../security/jwt";
import { AppError } from "../utils/AppError";

/**
 * Requires a valid Bearer access token in the Authorization header.
 * Populates req.user with the decoded token payload.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Missing or malformed access token"));
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    return next(AppError.unauthorized("Invalid or expired access token"));
  }
}

/** Attaches req.user if a valid token is present, but does not require it. */
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = verifyAccessToken(header.slice("Bearer ".length).trim());
    } catch {
      // ignore invalid token in optional mode
    }
  }
  next();
}
