import { Request, Response, NextFunction } from "express";
import { ok } from "../utils/response";
import { oauthClientConfigService } from "../services/oauth-client-config.service";

export const oauthClientConfigController = {
  async get(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { config: await oauthClientConfigService.get(req.user!.sub, req.params.clientId) }); } catch (err) { next(err); }
  },
  async upsert(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { config: await oauthClientConfigService.upsert(req.user!.sub, req.params.clientId, req.body) }); } catch (err) { next(err); }
  },
};
