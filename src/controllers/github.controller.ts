import { Request, Response, NextFunction } from "express";
import { githubService } from "../services/github.service";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const githubController = {
  async connect(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await githubService.createAuthorizationUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) { next(err); }
  },
  async callback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await githubService.handleCallback({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + `/connected-apps?github=${result.status}`);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?github=error");
    }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { profile: await githubService.me(req.user!.sub) }); }
    catch (err) { next(err); }
  },
  async repos(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { repos: await githubService.repos(req.user!.sub) }); }
    catch (err) { next(err); }
  },
};
