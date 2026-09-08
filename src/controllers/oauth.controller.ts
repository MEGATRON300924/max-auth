import { Request, Response, NextFunction } from "express";
import { oauthService } from "../services/oauth.service";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

function bearer(req: Request) {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export const oauthController = {
  async createClient(req: Request, res: Response, next: NextFunction) { try { const { name, redirectUris, scopes, isConfidential } = req.body; const result = await oauthService.createClient(req.user!.sub, { name, redirectUris, scopes, isConfidential }); return ok(res, { client: result.client, clientSecret: result.clientSecret, warning: "Store this client secret now — it will not be shown again." }, 201); } catch (err) { next(err); } },
  async listClients(req: Request, res: Response, next: NextFunction) { try { return ok(res, { clients: await oauthService.listClientsForOwner(req.user!.sub) }); } catch (err) { next(err); } },
  async revokeClient(req: Request, res: Response, next: NextFunction) { try { return ok(res, { client: await oauthService.revokeClient(req.user!.sub, req.params.clientId) }); } catch (err) { next(err); } },
  async listConsents(req: Request, res: Response, next: NextFunction) { try { return ok(res, { consents: await oauthService.listConsentsForUser(req.user!.sub) }); } catch (err) { next(err); } },
  async revokeConsent(req: Request, res: Response, next: NextFunction) { try { await oauthService.revokeConsent(req.user!.sub, req.params.consentId); return ok(res, { message: "Consent revoked" }); } catch (err) { next(err); } },

  async authorize(req: Request, res: Response, next: NextFunction) {
    try {
      const input = { clientId: String(req.query.client_id || ""), redirectUri: String(req.query.redirect_uri || ""), responseType: String(req.query.response_type || ""), scope: typeof req.query.scope === "string" ? req.query.scope : undefined, state: typeof req.query.state === "string" ? req.query.state : undefined, codeChallenge: typeof req.query.code_challenge === "string" ? req.query.code_challenge : undefined, codeChallengeMethod: typeof req.query.code_challenge_method === "string" ? req.query.code_challenge_method : undefined };
      const { client, scopes } = await oauthService.getAuthorizationRequest(input);
      const params = new URLSearchParams({ client_id: client.clientId, client_name: client.name, redirect_uri: input.redirectUri, response_type: "code", scope: scopes.join(" ") });
      if (input.state) params.set("state", input.state);
      if (input.codeChallenge) params.set("code_challenge", input.codeChallenge);
      if (input.codeChallengeMethod) params.set("code_challenge_method", input.codeChallengeMethod);
      return res.redirect(`${env.FRONTEND_URL}/authorize?${params.toString()}`);
    } catch (err) { next(err); }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId, redirectUri, scopes, codeChallenge, codeChallengeMethod, state } = req.body;
      const code = await oauthService.issueAuthorizationCode({ clientId, userId: req.user!.sub, redirectUri, scopes: String(scopes || "").split(" ").filter(Boolean), codeChallenge, codeChallengeMethod });
      const callback = new URL(redirectUri);
      callback.searchParams.set("code", code);
      if (state) callback.searchParams.set("state", state);
      return ok(res, { redirectUri: callback.toString() });
    } catch (err) { next(err); }
  },

  async token(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};
      const grantType = body.grant_type;
      if (grantType === "authorization_code") {
        const result = await oauthService.exchangeCode({ code: body.code, clientId: body.client_id, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier, clientSecret: body.client_secret });
        return res.json(result);
      }
      if (grantType === "refresh_token") {
        const result = await oauthService.refreshAccessToken(body.refresh_token, body.client_id, body.client_secret);
        return res.json(result);
      }
      throw AppError.badRequest("Unsupported grant type", "UNSUPPORTED_GRANT_TYPE");
    } catch (err) { next(err); }
  },

  async introspect(req: Request, res: Response, next: NextFunction) {
    try { return res.json(await oauthService.introspect(bearer(req) || "")); } catch (err) { next(err); }
  },

  async userinfo(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await oauthService.introspect(bearer(req) || "");
      if (!result.active) throw AppError.unauthorized("Invalid OAuth access token");
      return res.json({ sub: result.user.id, username: result.user.username, name: result.user.displayName, email: result.user.email, email_verified: result.user.verificationStatus === "VERIFIED", picture: result.user.avatarUrl, subscription_tier: result.user.subscriptionTier });
    } catch (err) { next(err); }
  },
};
