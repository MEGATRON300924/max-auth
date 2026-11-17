import { Response } from "express";
import { env } from "../config/env";

export function clearRefreshCookie(res: Response) {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE as "strict" | "lax" | "none",
    path: "/api/v1/auth",
  });
}
