import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { doubleCsrfProtection } from "../middleware/csrf";
import {
  loginRateLimiter,
  registerRateLimiter,
  sensitiveActionRateLimiter,
} from "../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  deleteAccountSchema,
} from "../validators/auth.validators";

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new MAX Account
 */
router.post("/register", registerRateLimiter, validate(registerSchema), authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Log in with email/username + password
 */
router.post("/login", loginRateLimiter, validate(loginSchema), authController.login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Log out and revoke the current refresh session
 */
router.post("/logout", doubleCsrfProtection, authController.logout);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Exchange a refresh token for a new access/refresh token pair
 */
router.post("/refresh", doubleCsrfProtection, authController.refresh);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get the currently authenticated user
 */
router.get("/me", authenticate, authController.me);

/**
 * @openapi
 * /auth/email/send-verification:
 *   post:
 *     tags: [Authentication]
 *     summary: Send (or resend) an email verification link
 */
router.post(
  "/email/send-verification",
  authenticate,
  sensitiveActionRateLimiter,
  authController.sendVerificationEmail
);

/**
 * @openapi
 * /auth/email/verify:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify email using a token from the verification email
 */
router.post("/email/verify", validate(verifyEmailSchema), authController.verifyEmail);

/**
 * @openapi
 * /auth/password/forgot:
 *   post:
 *     tags: [Authentication]
 *     summary: Request a password reset email
 */
router.post(
  "/password/forgot",
  sensitiveActionRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @openapi
 * /auth/password/reset:
 *   post:
 *     tags: [Authentication]
 *     summary: Reset password using a token from the reset email
 */
router.post(
  "/password/reset",
  sensitiveActionRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @openapi
 * /auth/password/change:
 *   post:
 *     tags: [Authentication]
 *     summary: Change password while authenticated
 */
router.post(
  "/password/change",
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * @openapi
 * /auth/account:
 *   delete:
 *     tags: [Authentication]
 *     summary: Permanently delete (soft-delete) the authenticated account
 */
router.delete(
  "/account",
  authenticate,
  validate(deleteAccountSchema),
  authController.deleteAccount
);

export default router;
