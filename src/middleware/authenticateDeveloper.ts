import { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../security/jwt";
import { sessionRepository } from "../repositories/session.repository";
import { oauthService } from "../services/oauth.service";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

const DEVELOPER_MANAGEMENT_SCOPE = "developer:manage";

function isOfficialDeveloperClient(clientId: string) {
  return new Set(["max_client_llITDlGy6a2tSJBX", "max_client_developers_platform_v1", "max_client_Rjxv2tyTV7Luek00", ...env.MAX_DEVELOPERS_CLIENT_IDS.split(",").map((value) => value.trim()).filter(Boolean)]).has(clientId);
}

/**
 * Developer-console endpoints accept either a normal MAX Auth session token
 * or an OAuth access token issued to the allowlisted MAX for Developers client.
 * OAuth tokens must explicitly carry developer:manage; ordinary app tokens
 * cannot use the developer console API.
 */
export async function authenticateDeveloper(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(AppError.unauthorized("Missing or malformed access token"));

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);
    const session = await sessionRepository.findById(payload.sessionId);
    if (session && !session.isRevoked && session.expiresAt > new Date() && session.userId === payload.sub && session.user.status === "ACTIVE") {
      void sessionRepository.touchLastUsed(session.id);
      req.user = payload;
      return next();
    }
  } catch {
    // OAuth access tokens are opaque and intentionally do not decode as JWTs.
  }

  try {
    const result = await oauthService.introspect(token);
    if (!result.active || !result.user || !result.scopes || !result.client_id) {
      return next(AppError.unauthorized("Invalid or expired access token", "INVALID_TOKEN"));
    }
    if (!isOfficialDeveloperClient(result.client_id)) {
      return next(AppError.forbidden("This application cannot access developer management endpoints", "DEVELOPER_CLIENT_NOT_ALLOWED"));
    }
    if (!result.scopes.includes(DEVELOPER_MANAGEMENT_SCOPE)) {
      return next(AppError.forbidden("The MAX Account token is missing developer management permission", "INSUFFICIENT_SCOPE"));
    }
    req.user = { sub: result.user.id } as AccessTokenPayload;
    return next();
  } catch (err) {
    return next(err instanceof AppError ? err : AppError.unauthorized("Invalid or expired access token", "INVALID_TOKEN"));
  }
}
