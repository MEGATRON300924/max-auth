import { Request, Response } from "express";
import { prisma } from "../database/prisma";
import { env } from "../config/env";

export const healthController = {
  liveness(_req: Request, res: Response) {
    res.status(200).json({ success: true, status: "alive", timestamp: new Date().toISOString() });
  },

  async readiness(_req: Request, res: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        success: true,
        status: "ready",
        service: env.APP_NAME,
        env: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        status: "not_ready",
        error: "Database connection failed",
      });
    }
  },
};
