import { Response } from "express";

export function ok(res: Response, data: unknown, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function sanitizeUser<T extends { passwordHash?: string }>(user: T) {
  const { passwordHash, ...safe } = user;
  return safe;
}
