import { NextFunction, Request, Response } from "express";
import { authenticate } from "./authenticate";
import { oauthService } from "../services/oauth.service";
import { AppError } from "../utils/AppError";

// Only the MAX Webchat OAuth client may access this sensitive, optional profile.
// Native MAX Auth session JWTs continue through the normal first-party auth path.
const MAX_CHAT_CLIENT_ID = "max_client_OHnbfpb_bEfwe1z9";

export async function authenticateReligionPreference(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return next(AppError.unauthorized("Missing or malformed access token"));
  if (token.split(".").length === 3) return authenticate(req, res, next);

  try {
    const oauth = await oauthService.introspect(token);
    if (!oauth.active) return next(AppError.unauthorized("Invalid or expired access token"));
    if (oauth.client_id !== MAX_CHAT_CLIENT_ID) {
      return next(AppError.forbidden("Religion preferences are only available to the authenticated MAX Webchat client.", "RELIGION_PREFERENCE_CLIENT_FORBIDDEN"));
    }
    const canRead = oauth.scopes.includes("profile") || oauth.scopes.includes("profile:read") || oauth.scopes.includes("profile:write");
    const canWrite = oauth.scopes.includes("profile:write");
    if (req.method === "GET" && !canRead) {
      return next(AppError.forbidden("Reading religion preferences requires profile:read permission.", "INSUFFICIENT_SCOPE"));
    }
    if (req.method !== "GET" && !canWrite) {
      return next(AppError.forbidden("Updating religion preferences requires profile:write permission.", "INSUFFICIENT_SCOPE"));
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
