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

  async googleCalendarConnect(req: Request, res: Response, next: NextFunction) {\n    try {\n      const authorizationUrl = await connectedAccountsService.createGoogleCalendarAuthorizationUrl(req.user!.sub);\n      res.setHeader("Cache-Control", "no-store");\n      return ok(res, { authorizationUrl });\n    } catch (err) { next(err); }\n  },\n\n  async googleCalendarCallback(req: Request, res: Response, next: NextFunction) {\n    try {\n      const result = await connectedAccountsService.handleGoogleCalendarCallback({\n        code: typeof req.query.code === "string" ? req.query.code : undefined,\n        state: typeof req.query.state === "string" ? req.query.state : undefined,\n        error: typeof req.query.error === "string" ? req.query.error : undefined,\n      });\n      res.setHeader("Cache-Control", "no-store");\n      return res.redirect(env.FRONTEND_URL + `/connected-apps?google_calendar=${result.status}`);\n    } catch (err) {\n      res.setHeader("Cache-Control", "no-store");\n      return res.redirect(env.FRONTEND_URL + "/connected-apps?google_calendar=error");\n    }\n  },\n\n  async spotifyConnect(req: Request, res: Response, next: NextFunction) {
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
      return res.redirect(env.FRONTEND_URL + `/connected-apps?spotify=${result.status}`);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?spotify=error");
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
