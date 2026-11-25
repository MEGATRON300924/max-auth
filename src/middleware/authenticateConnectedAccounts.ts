import { NextFunction, Request, Response } from "express";
import { authenticate } from "./authenticate";
import { oauthService } from "../services/oauth.service";
import { AppError } from "../utils/AppError";

// OAuth access tokens issued to MAX Chat are opaque database-backed tokens,
// not first-party session JWTs. Keep native MAX Auth sessions on the existing
// JWT path and introspect OAuth tokens before exposing connected-account data.
const MAX_CHAT_CLIENT_ID = "max_client_OHnbfpb_bEfwe1z9";
const READ_SCOPE = "connected-apps:read";
const WRITE_SCOPE = "profile:write";

export async function authenticateConnectedAccounts(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) return next(AppError.unauthorized("Missing or malformed access token"));

  // First-party MAX Auth session JWTs retain their existing validation,
  // session-revocation checks, and account-status enforcement.
  if (token.split(".").length === 3) return authenticate(req, res, next);

  try {
    const oauth = await oauthService.introspect(token);
    if (!oauth.active || !oauth.user || !oauth.client_id || !oauth.scopes) {
      return next(AppError.unauthorized("Invalid or expired access token", "INVALID_TOKEN"));
    }

    // Connected-account access from the webchat is deliberately limited to
    // the official MAX Chat OAuth client. Other OAuth applications must not
    // inherit the user's linked provider credentials.
    if (oauth.client_id !== MAX_CHAT_CLIENT_ID) {
      return next(AppError.forbidden("Connected accounts are only available to the authenticated MAX Chat application.", "CONNECTED_ACCOUNT_CLIENT_FORBIDDEN"));
    }

    if (!oauth.scopes.includes(READ_SCOPE)) {
      return next(AppError.forbidden("This application has not been granted permission to access connected services.", "INSUFFICIENT_SCOPE"));
    }

    const isConnectionStart = req.method === "GET" && /\/connect$/.test(req.path);
    const isMutation = req.method !== "GET" && req.method !== "HEAD";
    if ((isConnectionStart || isMutation) && !oauth.scopes.includes(WRITE_SCOPE)) {
      return next(AppError.forbidden("Managing connected services requires the profile:write permission. Reconnect MAX Chat and approve this permission.", "INSUFFICIENT_SCOPE"));
    }

    res.setHeader("Cache-Control", "no-store");
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
