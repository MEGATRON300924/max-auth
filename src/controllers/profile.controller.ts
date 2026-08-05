import { Request, Response, NextFunction } from "express";
import { userService } from "../services/user.service";
import { ok, sanitizeUser } from "../utils/response";
import { getRequestContext } from "../utils/requestContext";

export const profileController = {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.getProfile(req.user!.sub);
      return ok(res, { user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const user = await userService.updateProfile(req.user!.sub, req.body, ctx);
      return ok(res, { user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  },

  async getAIProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await userService.getAIProfile(req.user!.sub);
      return ok(res, { aiProfile: profile });
    } catch (err) {
      next(err);
    }
  },

  async updateAIProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await userService.updateAIProfile(req.user!.sub, req.body);
      return ok(res, { aiProfile: profile });
    } catch (err) {
      next(err);
    }
  },
};
