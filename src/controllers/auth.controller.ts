import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { googleAuthService } from "../services/googleAuth.service";
import { userService } from "../services/user.service";
import { notificationService } from "../services/notification.service";
import { ok, sanitizeUser } from "../utils/response";
import { getRequestContext } from "../utils/requestContext";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

// The refresh token is only consumed by auth.max-ai.name.ng.
// Keep it host-only instead of using a parent-domain cookie. This avoids
// browser domain/path policy differences between api.max-ai.name.ng,
// developers.max-ai.name.ng and auth.max-ai.name.ng.
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: "/api/v1/auth",
} as const;

function setRefreshCookie(res: Response, refreshToken: string, rememberMe = true) {
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions,
    ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}),
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions);
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); const { user, accessToken, refreshToken, rememberMe } = await authService.register(req.body, ctx); setRefreshCookie(res, refreshToken, rememberMe); void notificationService.sendWelcomeNotification(user); return ok(res, { user: sanitizeUser(user), accessToken }); } catch (err) { next(err); } },
  async login(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); const { identifier, password, rememberMe = true, mfaCode } = req.body; const { user, accessToken, refreshToken, rememberMe: persistedRememberMe } = await authService.login(identifier, password, ctx, rememberMe, mfaCode); setRefreshCookie(res, refreshToken, persistedRememberMe); void notificationService.sendLoginNotification(user, ctx); return ok(res, { user: sanitizeUser(user), accessToken }); } catch (err) { next(err); } },
  async google(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); const { user, accessToken, refreshToken } = await googleAuthService.signIn(req.body.credential, ctx, req.body.mfaCode); setRefreshCookie(res, refreshToken, true); return ok(res, { user: sanitizeUser(user), accessToken }); } catch (err) { next(err); } },
  async googleConnect(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await googleAuthService.connect(req.user!.sub, req.body.credential, ctx); return ok(res, { message: "Google account connected" }); } catch (err) { next(err); } },
  async logout(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); const raw = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken; await authService.logout(raw, req.user?.sub, ctx); clearRefreshCookie(res); return ok(res, { message: "Logged out successfully" }); } catch (err) { next(err); } },
  async refresh(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); const raw = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken; if (!raw) throw AppError.unauthorized("No refresh token provided"); const tokens = await authService.refresh(raw, ctx); setRefreshCookie(res, tokens.refreshToken, tokens.rememberMe); return ok(res, { accessToken: tokens.accessToken }); } catch (err) { next(err); } },
  async sendVerificationEmail(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await authService.sendEmailVerification(req.user!.sub, ctx); return ok(res, { message: "Verification email sent" }); } catch (err) { next(err); } },
  async verifyEmail(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await authService.verifyEmail(req.body.token, ctx); return ok(res, { message: "Email verified successfully" }); } catch (err) { next(err); } },
  async forgotPassword(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await authService.forgotPassword(req.body.email, ctx); return ok(res, { message: "If an account with that email exists, a reset link has been sent" }); } catch (err) { next(err); } },
  async resetPassword(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await authService.resetPassword(req.body.token, req.body.newPassword, ctx); return ok(res, { message: "Password reset successfully. Please log in again." }); } catch (err) { next(err); } },
  async changePassword(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await authService.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword, ctx); const user = await userService.getProfile(req.user!.sub); void notificationService.sendPasswordChangedNotification(user); return ok(res, { message: "Password changed successfully" }); } catch (err) { next(err); } },
  async deleteAccount(req: Request, res: Response, next: NextFunction) { try { noStore(res); const ctx = getRequestContext(req); await authService.deleteAccount(req.user!.sub, req.body.password, ctx); clearRefreshCookie(res); return ok(res, { message: "Account deleted" }); } catch (err) { next(err); } },
  async me(req: Request, res: Response, next: NextFunction) { try { noStore(res); const user = await userService.getProfile(req.user!.sub); return ok(res, { user: sanitizeUser(user) }); } catch (err) { next(err); } },
};
