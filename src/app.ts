import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import { requestId } from "./middleware/requestId";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import apiRouter from "./routes";

export function createApp() {
  const app = express();

  // Trust proxy (needed for correct req.ip behind Render/Vercel/nginx/etc.)
  app.set("trust proxy", 1);

  // --- Core security headers ---
  app.use(
    helmet({
      contentSecurityPolicy: env.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );

  // --- CORS ---
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "x-client-id", "x-request-id"],
    })
  );

  // --- Body & cookie parsing ---
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(compression());

  // --- Tracing & rate limiting ---
  app.use(requestId);
  app.use(globalRateLimiter);

  // --- API Docs ---
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/docs.json", (_req, res) => res.json(swaggerSpec));

  // --- Root ---
  app.get("/", (_req, res) => {
    res.json({
      success: true,
      service: env.APP_NAME,
      status: "running",
      docs: "/docs",
    });
  });

  // --- API v1 ---
  app.use("/api/v1", apiRouter);

  // --- 404 + error handling (must be last) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
