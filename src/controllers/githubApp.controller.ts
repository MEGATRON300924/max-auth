import { Request, Response, NextFunction } from "express";
import { githubAppService } from "../services/githubApp.service";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const githubAppController = {
  async install(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await githubAppService.createInstallUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) { next(err); }
  },
  async callback(req: Request, res: Response) {
    try {
      await githubAppService.handleInstallCallback({
        installationId: typeof req.query.installation_id === "string" ? req.query.installation_id : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        setupAction: typeof req.query.setup_action === "string" ? req.query.setup_action : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?github_app=connected");
    } catch {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?github_app=error");
    }
  },
  async list(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { installations: await githubAppService.list(req.user!.sub) }); }
    catch (err) { next(err); }
  },
  async editAccess(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await githubAppService.editAccessUrl(req.user!.sub, req.params.installationId)); }
    catch (err) { next(err); }
  },
};
