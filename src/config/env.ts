import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: parseInt(optional("PORT", "4000"), 10),
  APP_NAME: optional("APP_NAME", "MAX Auth"),
  APP_URL: optional("APP_URL", "http://localhost:4000"),
  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:3000"),

  DATABASE_URL: required("DATABASE_URL"),

  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
  JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "30d"),
  JWT_ISSUER: optional("JWT_ISSUER", "max-auth"),
  JWT_AUDIENCE: optional("JWT_AUDIENCE", "max-ecosystem"),

  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: parseInt(
    optional("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", "24"),
    10
  ),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: parseInt(
    optional("PASSWORD_RESET_TOKEN_TTL_MINUTES", "30"),
    10
  ),

  COOKIE_DOMAIN: optional("COOKIE_DOMAIN", "localhost"),
  COOKIE_SECURE: optional("COOKIE_SECURE", "false") === "true",
  REFRESH_COOKIE_NAME: optional("REFRESH_COOKIE_NAME", "max_refresh_token"),

  CSRF_SECRET: required("CSRF_SECRET"),

  RATE_LIMIT_WINDOW_MINUTES: parseInt(
    optional("RATE_LIMIT_WINDOW_MINUTES", "15"),
    10
  ),
  RATE_LIMIT_MAX_REQUESTS: parseInt(
    optional("RATE_LIMIT_MAX_REQUESTS", "100"),
    10
  ),
  LOGIN_RATE_LIMIT_MAX: parseInt(optional("LOGIN_RATE_LIMIT_MAX", "10"), 10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: parseInt(
    optional("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "15"),
    10
  ),

  CORS_ALLOWED_ORIGINS: optional(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000"
  ).split(",").map((s) => s.trim()),

  ARGON2_MEMORY_COST: parseInt(optional("ARGON2_MEMORY_COST", "19456"), 10),
  ARGON2_TIME_COST: parseInt(optional("ARGON2_TIME_COST", "2"), 10),
  ARGON2_PARALLELISM: parseInt(optional("ARGON2_PARALLELISM", "1"), 10),

  MAIL_FROM: optional("MAIL_FROM", "MAX Auth <no-reply@max-ai.name.ng>"),
  MAIL_PROVIDER: optional("MAIL_PROVIDER", "console"),

  OAUTH_AUTH_CODE_TTL_MINUTES: parseInt(
    optional("OAUTH_AUTH_CODE_TTL_MINUTES", "10"),
    10
  ),
  OAUTH_ACCESS_TOKEN_TTL_MINUTES: parseInt(
    optional("OAUTH_ACCESS_TOKEN_TTL_MINUTES", "60"),
    10
  ),
  OAUTH_REFRESH_TOKEN_TTL_DAYS: parseInt(
    optional("OAUTH_REFRESH_TOKEN_TTL_DAYS", "30"),
    10
  ),

  LOG_LEVEL: optional("LOG_LEVEL", "info"),
  LOG_DIR: optional("LOG_DIR", "logs"),

  get isProduction() {
    return this.NODE_ENV === "production";
  },
};
