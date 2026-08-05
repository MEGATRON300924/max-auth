import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

/**
 * Single shared Prisma Client instance.
 * Query/error logging is handled via Prisma's built-in `log` option rather than
 * event subscriptions, to avoid brittle typing across Prisma versions.
 */
export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: env.isProduction ? ["error"] : ["error", "warn"],
  });

if (!env.isProduction) {
  global.__prisma__ = prisma;
}
