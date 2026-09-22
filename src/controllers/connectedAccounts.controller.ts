import { Request, Response, NextFunction } from "express";
import { connectedAccountsService } from "../services/connectedAccounts.service";
import { getRequestContext } from "../utils/requestContext";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const connectedAccountsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const accounts = await connectedAccountsService.list(req.user!.sub);
      return ok(res, { accounts });
    } catch (err) {
      next(err);
    }
  },

  async spotifyConnect(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await connectedAccountsService.createSpotifyAuthorizationUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) {
      next(err);
    }
  },

  async spotifyCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.handleSpotifyCallback(
        {
          code: typeof req.query.code === "string" ? req.query.code : undefined,
          state: typeof req.query.state === "string" ? req.query.state : undefined,
          error: typeof req.query.error === "string" ? req.query.error : undefined,
        },
        req,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(`undefined/connected-apps?spotify=${result.status}`);
    } catch (err) {
      next(err);
    }
  },

  async spotifyRefresh(req: Request, res: Response, next: NextFunction) {
    try {
      const account = await connectedAccountsService.refreshSpotify(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { account });
    } catch (err) {
      next(err);
    }
  },

  async unlink(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await connectedAccountsService.unlink(req.user!.sub, req.params.accountId, ctx);
      return ok(res, { message: "Account unlinked" });
    } catch (err) {
      next(err);
    }
  },
};
