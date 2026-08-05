import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { userService } from "../services/user.service";
import { ok, sanitizeUser } from "../utils/response";
import { getRequestContext } from "../utils/requestContext";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    domain: env.isProduction ? env.COOKIE_DOMAIN : undefined,
    path: "/api/v1/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });
}

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { user, accessToken, refreshToken } = await authService.register(req.body, ctx);
      setRefreshCookie(res, refreshToken);
      return ok(res, { user: sanitizeUser(user), accessToken }, 201);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { identifier, password } = req.body;
      const { user, accessToken, refreshToken } = await authService.login(
        identifier,
        password,
        ctx
      );
      setRefreshCookie(res, refreshToken);
      return ok(res, { user: sanitizeUser(user), accessToken });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const raw = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      await authService.logout(raw, req.user?.sub, ctx);
      clearRefreshCookie(res);
      return ok(res, { message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const raw = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      if (!raw) throw AppError.unauthorized("No refresh token provided");

      const tokens = await authService.refresh(raw, ctx);
      setRefreshCookie(res, tokens.refreshToken);
      return ok(res, { accessToken: tokens.accessToken });
    } catch (err) {
      next(err);
    }
  },

  async sendVerificationEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await authService.sendEmailVerification(req.user!.sub, ctx);
      return ok(res, { message: "Verification email sent" });
    } catch (err) {
      next(err);
    }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await authService.verifyEmail(req.body.token, ctx);
      return ok(res, { message: "Email verified successfully" });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await authService.forgotPassword(req.body.email, ctx);
      // Always return a generic success message to prevent user enumeration.
      return ok(res, {
        message: "If an account with that email exists, a reset link has been sent",
      });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await authService.resetPassword(req.body.token, req.body.newPassword, ctx);
      return ok(res, { message: "Password reset successfully. Please log in again." });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await authService.changePassword(
        req.user!.sub,
        req.body.currentPassword,
        req.body.newPassword,
        ctx
      );
      return ok(res, { message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  },

  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await authService.deleteAccount(req.user!.sub, req.body.password, ctx);
      clearRefreshCookie(res);
      return ok(res, { message: "Account deleted" });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.getProfile(req.user!.sub);
      return ok(res, { user: sanitizeUser(user) });
    } catch (err) {
      next(err);
    }
  },
};
