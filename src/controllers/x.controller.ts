import { Request, Response, NextFunction } from "express";
import { xService } from "../services/x.service";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const xController = {
  async connect(req: Request, res: Response, next: NextFunction) { try { const authorizationUrl = await xService.createAuthorizationUrl(req.user!.sub); res.setHeader("Cache-Control", "no-store"); return ok(res, { authorizationUrl }); } catch (err) { next(err); } },
  async callback(req: Request, res: Response, next: NextFunction) { try { const result = await xService.handleCallback({ code: typeof req.query.code === "string" ? req.query.code : undefined, state: typeof req.query.state === "string" ? req.query.state : undefined, error: typeof req.query.error === "string" ? req.query.error : undefined }, { ipAddress: req.ip, userAgent: req.headers["user-agent"] }); res.setHeader("Cache-Control", "no-store"); return res.redirect(env.FRONTEND_URL + "/connected-apps?x=" + result.status); } catch (err) { res.setHeader("Cache-Control", "no-store"); return res.redirect(env.FRONTEND_URL + "/connected-apps?x=error"); } },
  async me(req: Request, res: Response, next: NextFunction) { try { return ok(res, { profile: await xService.me(req.user!.sub) }); } catch (err) { next(err); } },
  async posts(req: Request, res: Response, next: NextFunction) { try { return ok(res, { posts: await xService.posts(req.user!.sub) }); } catch (err) { next(err); } },
};