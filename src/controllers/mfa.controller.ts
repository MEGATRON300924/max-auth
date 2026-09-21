import { Request, Response, NextFunction } from "express";
import { mfaService } from "../services/mfa.service";
import { ok } from "../utils/response";
import { getRequestContext } from "../utils/requestContext";
import { userService } from "../services/user.service";
import { notificationService } from "../services/notification.service";

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

export const mfaController = {
  async status(req: Request, res: Response, next: NextFunction) {
    try { noStore(res); return ok(res, await mfaService.status(req.user!.sub)); } catch (err) { next(err); }
  },
  async beginSetup(req: Request, res: Response, next: NextFunction) {
    try { noStore(res); return ok(res, await mfaService.beginSetup(req.user!.sub, req.body.password)); } catch (err) { next(err); }
  },
  async enable(req: Request, res: Response, next: NextFunction) {
    try { noStore(res); const result = await mfaService.enable(req.user!.sub, req.body.password, req.body.code, getRequestContext(req)); const user = await userService.getProfile(req.user!.sub); void notificationService.sendMfaChangedNotification(user, "enabled"); return ok(res, result); } catch (err) { next(err); }
  },
  async regenerateRecoveryCodes(req: Request, res: Response, next: NextFunction) {
    try { noStore(res); const result = await mfaService.regenerateRecoveryCodes(req.user!.sub, req.body.password, req.body.code, getRequestContext(req)); return ok(res, result); } catch (err) { next(err); }
  },
  async disable(req: Request, res: Response, next: NextFunction) {
    try { noStore(res); const result = await mfaService.disable(req.user!.sub, req.body.password, req.body.code, getRequestContext(req)); const user = await userService.getProfile(req.user!.sub); void notificationService.sendMfaChangedNotification(user, "disabled"); return ok(res, result); } catch (err) { next(err); }
  },
};
