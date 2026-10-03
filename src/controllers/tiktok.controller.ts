import { Request, Response, NextFunction } from "express";
import { tiktokService } from "../services/tiktok.service";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const tiktokController = {
  async connect(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { authorizationUrl: await tiktokService.createAuthorizationUrl(req.user!.sub) }); } catch (e) { next(e); }
  },
  async callback(req: Request, res: Response) {
    try {
      const r = await tiktokService.callback({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        error_description: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
      }, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
      return res.redirect(env.FRONTEND_URL + "/connected-apps?tiktok=" + r.status);
    } catch {
      return res.redirect(env.FRONTEND_URL + "/connected-apps?tiktok=error");
    }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { profile: await tiktokService.me(req.user!.sub) }); } catch (e) { next(e); }
  },
  async videos(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await tiktokService.videos(req.user!.sub)); } catch (e) { next(e); }
  },
  async refresh(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await tiktokService.refresh(req.user!.sub)); } catch (e) { next(e); }
  },
};
