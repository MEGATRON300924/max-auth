import { NextFunction, Request, Response } from "express";
import { usageService } from "../services/usage.service";

export function usageTelemetry(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    void usageService.record({
      userId: req.user?.sub,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });
  });

  next();
}
