import { Request, Response, NextFunction } from "express";
import { discordService } from "../services/discord.service";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const discordController = {
  async connect(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await discordService.createAuthorizationUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) { next(err); }
  },
  async callback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await discordService.handleCallback({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + `/connected-apps?discord=${result.status}`);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?discord=error");
    }
  },
  async me(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { profile: await discordService.me(req.user!.sub) }); }
    catch (err) { next(err); }
  },
  async guilds(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { guilds: await discordService.guilds(req.user!.sub) }); }
    catch (err) { next(err); }
  },
};