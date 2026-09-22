import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { doubleCsrfProtection } from "../middleware/csrf";
import { loginRateLimiter, registerRateLimiter, sensitiveActionRateLimiter, oauthRateLimiter } from "../middleware/rateLimiter";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, verifyEmailSchema, deleteAccountSchema } from "../validators/auth.validators";
import { z } from "zod";

const router = Router();
const googleSchema = z.object({ body: z.object({ credential: z.string().min(20).max(10000) }) });
router.post("/register", registerRateLimiter, validate(registerSchema), authController.register);
router.post("/login", loginRateLimiter, validate(loginSchema), authController.login);
router.post("/google", loginRateLimiter, validate(googleSchema), authController.google);
router.post("/google/connect", authenticate, oauthRateLimiter, validate(googleSchema), authController.googleConnect);
router.post("/logout", doubleCsrfProtection, authController.logout);
// Refresh is protected by the httpOnly, Secure, SameSite cookie itself. Do not
// require the IP-bound double-submit CSRF token here: browsers/proxies can
// legitimately present a different req.ip between the bootstrap token request
// and the refresh request, which would make an otherwise valid session fail on
// every page reload.
router.post("/refresh", authController.refresh);
router.get("/me", authenticate, authController.me);
router.post("/email/send-verification", authenticate, sensitiveActionRateLimiter, authController.sendVerificationEmail);
router.post("/email/verify", validate(verifyEmailSchema), authController.verifyEmail);
router.post("/password/forgot", sensitiveActionRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/password/reset", sensitiveActionRateLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post("/password/change", authenticate, validate(changePasswordSchema), authController.changePassword);
router.delete("/account", authenticate, validate(deleteAccountSchema), authController.deleteAccount);
export default router;
