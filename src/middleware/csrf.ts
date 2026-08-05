import { doubleCsrf } from "csrf-csrf";
import { env } from "../config/env";

/**
 * CSRF protection using the double-submit cookie pattern.
 * - A CSRF secret cookie is set (httpOnly).
 * - The client must echo the CSRF token back in the `x-csrf-token` header
 *   (retrieved from GET /api/v1/security/csrf-token) for any unsafe method.
 *
 * This protects cookie-based refresh-token flows from cross-site request forgery.
 * Bearer-token (Authorization header) requests are inherently CSRF-safe since
 * browsers do not attach custom headers automatically, but we still protect
 * any endpoint that relies on cookies (refresh, logout).
 */
export const {
  doubleCsrfProtection,
  generateToken: generateCsrfToken,
} = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: env.isProduction ? "__Host-max.csrf" : "max.csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: env.COOKIE_SECURE,
    path: "/",
  },
  size: 64,
  getSessionIdentifier: (req) => req.ip ?? "anonymous",
});
