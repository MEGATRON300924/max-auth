import { NextFunction, Request, Response } from "express";
import { usageService } from "../services/usage.service";
import { sanitizeDiagnosticPath } from "../utils/diagnostics";

export function usageTelemetry(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.path === "/oauth/introspect" || req.path === "/oauth/jwks" || req.path.endsWith("/internal/diagnostics/events")) return next();
  const startedAt = Date.now();

  res.on("finish", () => {
    void usageService.record({
      userId: req.user?.sub,
      method: req.method,
      path: sanitizeDiagnosticPath(req.path),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    }).catch(() => undefined);
  });

  next();
}
