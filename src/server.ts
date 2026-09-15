import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./database/prisma";
import { ensureSystemOAuthClients } from "./services/systemOAuth.service";
import { webhookService } from "./services/webhook.service";

async function start() {
  await ensureSystemOAuthClients();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`${env.APP_NAME} listening on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`API docs available at ${env.APP_URL}/docs`);
  });

  const webhookRetryInterval = setInterval(() => {
    webhookService.retryPending().catch((error) => {
      logger.error("Webhook retry worker failed", { error });
    });
  }, 30_000);
  webhookRetryInterval.unref();

  async function shutdown(signal: string) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    clearInterval(webhookRetryInterval);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info("Shutdown complete.");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch(async (error) => {
  logger.error("MAX Auth failed to start", { error });
  await prisma.$disconnect();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { reason });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", { message: err.message, stack: err.stack });
  process.exit(1);
});
