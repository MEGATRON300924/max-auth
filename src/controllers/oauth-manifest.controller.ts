import { Request, Response, NextFunction } from "express";
import { oauthManifestService } from "../services/oauth-manifest.service";
import { ok } from "../utils/response";

export const oauthManifestController = {
  async verify(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await oauthManifestService.verify(req.user!.sub, req.params.clientId)); } catch (err) { next(err); }
  },
};
