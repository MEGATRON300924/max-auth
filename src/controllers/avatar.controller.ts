import { Request, Response, NextFunction } from "express";
import { cloudinaryService } from "../services/cloudinary.service";
import { userService } from "../services/user.service";
import { ok, sanitizeUser } from "../utils/response";
import { getRequestContext } from "../utils/requestContext";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

export const avatarController = {
  signUpload(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, cloudinaryService.createAvatarUpload(req.user!.sub));
    } catch (error) { next(error); }
  },
  async signSpotlightUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewer = await prisma.spotlightEntityReviewer.findUnique({
        where: { userId: req.user!.sub },
        select: { userId: true },
      });
      if (!reviewer) throw AppError.forbidden("Only approved MAX Spotlight reviewers can upload entity media.", "SPOTLIGHT_REVIEW_ACCESS_REQUIRED");
      const entityPublicId = String(req.body?.entityPublicId || "");
      return ok(res, cloudinaryService.createSpotlightUpload(req.user!.sub, entityPublicId));
    } catch (error) { next(error); }
  },
  async completeUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const publicId = String(req.body?.publicId || "");
      const avatarUrl = cloudinaryService.getAvatarUrl(req.user!.sub, publicId);
      const user = await userService.updateProfile(req.user!.sub, { avatarUrl }, getRequestContext(req));
      return ok(res, { user: sanitizeUser(user), avatarUrl });
    } catch (error) { next(error); }
  }
};
