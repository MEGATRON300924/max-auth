import { Request, Response, NextFunction } from "express";
import { personalizationService } from "../services/personalization.service";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";

export const personalizationController = {
  async snapshot(req: Request, res: Response, next: NextFunction) {
    try {
      const snapshot = await personalizationService.getSnapshot(req.params.userId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { snapshot });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await personalizationService.updateProfile(req.params.userId, req.body || {});
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { profile });
    } catch (err) {
      next(err);
    }
  },

  async updateServiceSignals(req: Request, res: Response, next: NextFunction) {
    try {
      const provider = String(req.params.provider || "").trim().toUpperCase();
      if (!provider) throw AppError.badRequest("Provider is required", "PROVIDER_REQUIRED");
      const profile = await personalizationService.updateServiceSignals(req.params.userId, provider, req.body || {});
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { profile });
    } catch (err) {
      next(err);
    }
  },
};
