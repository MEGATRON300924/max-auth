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
import { oauthController } from "./controllers/oauth.controller";
import apiRouter from "./routes";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: env.isProduction ? undefined : false, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: env.CORS_ALLOWED_ORIGINS, credentials: true, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "x-client-id", "x-request-id"] }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(compression());
  app.use(requestId);
  app.use(globalRateLimiter);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/docs.json", (_req, res) => res.json(swaggerSpec));
  app.get("/.well-known/openid-configuration", oauthController.discovery);
  app.get("/.well-known/jwks.json", oauthController.jwks);
  app.get("/", (_req, res) => res.json({ success: true, service: env.APP_NAME, status: "running", docs: "/docs", identity: "/.well-known/openid-configuration" }));
  app.use("/api/v1", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
