import { Request } from "express";

export function getRequestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    clientHint: (req.headers["x-client-id"] as string) || undefined,
  };
}
