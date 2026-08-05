import { Request, Response, NextFunction } from "express";
import { oauthService } from "../services/oauth.service";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";

export const oauthController = {
  async createClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, redirectUris, scopes, isConfidential } = req.body;
      const result = await oauthService.createClient(req.user!.sub, {
        name,
        redirectUris,
        scopes,
        isConfidential,
      });
      return ok(
        res,
        {
          client: result.client,
          clientSecret: result.clientSecret, // shown once
          warning: "Store this client secret now — it will not be shown again.",
        },
        201
      );
    } catch (err) {
      next(err);
    }
  },

  async listClients(req: Request, res: Response, next: NextFunction) {
    try {
      const clients = await oauthService.listClientsForOwner(req.user!.sub);
      return ok(res, { clients });
    } catch (err) {
      next(err);
    }
  },

  async revokeClient(req: Request, res: Response, next: NextFunction) {
    try {
      const client = await oauthService.revokeClient(req.user!.sub, req.params.clientId);
      return ok(res, { client });
    } catch (err) {
      next(err);
    }
  },

  async listConsents(req: Request, res: Response, next: NextFunction) {
    try {
      const consents = await oauthService.listConsentsForUser(req.user!.sub);
      return ok(res, { consents });
    } catch (err) {
      next(err);
    }
  },

  async revokeConsent(req: Request, res: Response, next: NextFunction) {
    try {
      await oauthService.revokeConsent(req.user!.sub, req.params.consentId);
      return ok(res, { message: "Consent revoked" });
    } catch (err) {
      next(err);
    }
  },

  /**
   * "Continue with MAX AI" authorization endpoint.
   * Architecture is in place (OAuthClient, OAuthAuthorizationCode tables, PKCE fields)
   * but the interactive consent + code issuance flow is intentionally not implemented yet.
   */
  authorize(_req: Request, _res: Response, next: NextFunction) {
    next(
      new AppError(
        "The MAX AI OAuth authorization flow is not implemented yet. The client/scope/consent architecture is ready for future rollout.",
        501,
        "NOT_IMPLEMENTED"
      )
    );
  },

  /** Token exchange endpoint — not implemented yet, see `authorize` note above. */
  token(_req: Request, _res: Response, next: NextFunction) {
    next(
      new AppError(
        "The MAX AI OAuth token exchange is not implemented yet.",
        501,
        "NOT_IMPLEMENTED"
      )
    );
  },
};
