import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./database/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`${env.APP_NAME} listening on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`API docs available at ${env.APP_URL}/docs`);
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Shutdown complete.");
    process.exit(0);
  });

  // Force-exit if shutdown hangs
  setTimeout(() => {
    logger.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { reason });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", { message: err.message, stack: err.stack });
  process.exit(1);
});
