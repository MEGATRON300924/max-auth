import { Request, Response, NextFunction } from "express";
import { oauthClientLogoService } from "../services/oauth-client-logo.service";
import { ok } from "../utils/response";

export const oauthClientLogoController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await oauthClientLogoService.upload(req.user!.sub, req.params.clientId, req.body.contentType, req.body.data)); } catch (err) { next(err); }
  },
  async remove(req: Request, res: Response, next: NextFunction) {
    try { await oauthClientLogoService.remove(req.user!.sub, req.params.clientId); return ok(res, { removed: true }); } catch (err) { next(err); }
  },
  async publicLogo(req: Request, res: Response, next: NextFunction) {
    try {
      const logo = await oauthClientLogoService.publicLogo(req.params.clientId);
      if (!logo) return res.status(404).end();
      res.setHeader("Content-Type", logo.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(logo.data);
    } catch (err) { next(err); }
  },
};
