import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { env } from "../config/env";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `[${ts}] ${level}: ${stack || message}`;
  })
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new DailyRotateFile({
      dirname: path.join(process.cwd(), env.LOG_DIR),
      filename: "max-auth-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      format: fileFormat,
    }),
    new DailyRotateFile({
      dirname: path.join(process.cwd(), env.LOG_DIR),
      filename: "max-auth-error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      level: "error",
      format: fileFormat,
    }),
  ],
  exitOnError: false,
});

// Never crash if the logs directory can't be created in restricted environments
logger.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Logger error:", err);
});
