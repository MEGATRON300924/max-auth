import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
function required(name: string, fallback?: string): string { const value = process.env[name] ?? fallback; if (value === undefined || value.trim() === "") throw new Error(`Missing required environment variable: ${name}`); return value; }
function requiredSecret(name: string, minBytes = 32): string { const value = required(name); if (Buffer.byteLength(value, "utf8") < minBytes) throw new Error(`${name} must contain at least ${minBytes} bytes. Generate a unique cryptographically secure secret for this environment.`); return value; }
function optional(name: string, fallback: string): string { return process.env[name] ?? fallback; }
const isProduction = (process.env.NODE_ENV ?? "development") === "production";
const appUrl = process.env.APP_URL ?? (isProduction ? "https://auth.max-ai.name.ng" : "http://localhost:4000");
const isHttpsApp = appUrl.startsWith("https://");
const isLocalApp = /https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(appUrl);
const defaultCookieDomain = isLocalApp ? "localhost" : "max-ai.name.ng";
const configuredCookieDomain = process.env.COOKIE_DOMAIN?.trim();
const cookieDomain = configuredCookieDomain && !(configuredCookieDomain === "localhost" && !isLocalApp) ? configuredCookieDomain : defaultCookieDomain;

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"), PORT: parseInt(optional("PORT", "4000"), 10), APP_NAME: optional("APP_NAME", "MAX Auth"), APP_URL: appUrl, FRONTEND_URL: optional("FRONTEND_URL", isProduction ? "https://api.max-ai.name.ng" : "http://localhost:3000"),
  MAX_AI_BACKEND_URL: optional("MAX_AI_BACKEND_URL", "https://max-backend-z0ee.onrender.com"),
  MAX_AUTH_SERVICE_TOKEN: optional("MAX_AUTH_SERVICE_TOKEN", ""),
  CLOUDINARY_CLOUD_NAME: optional("CLOUDINARY_CLOUD_NAME", ""),
  CLOUDINARY_API_KEY: optional("CLOUDINARY_API_KEY", ""),
  CLOUDINARY_API_SECRET: optional("CLOUDINARY_API_SECRET", ""),
  MAX_DEVELOPERS_CLIENT_IDS: optional("MAX_DEVELOPERS_CLIENT_IDS", "max_client_llITDlGy6a2tSJBX,max_client_developers_platform_v1"),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"), JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"), WEBHOOK_ENCRYPTION_KEY: optional("WEBHOOK_ENCRYPTION_KEY", isProduction ? "" : required("JWT_REFRESH_SECRET")), JWT_ACCESS_EXPIRES_IN: optional("JWT_ACCESS_EXPIRES_IN", "15m"), JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "365d"), SESSION_IDLE_TIMEOUT_DAYS: parseInt(optional("SESSION_IDLE_TIMEOUT_DAYS", "30"), 10), SESSION_ABSOLUTE_TIMEOUT_DAYS: parseInt(optional("SESSION_ABSOLUTE_TIMEOUT_DAYS", "365"), 10), JWT_ISSUER: optional("JWT_ISSUER", "max-auth"), JWT_AUDIENCE: optional("JWT_AUDIENCE", "max-ecosystem"),
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID", ""), GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET", ""),
  GOOGLE_REDIRECT_URI: optional("GOOGLE_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/google/calendar/callback"),
  GOOGLE_TOKEN_ENCRYPTION_KEY: optional("GOOGLE_TOKEN_ENCRYPTION_KEY", ""),
  SPOTIFY_CLIENT_ID: optional("SPOTIFY_CLIENT_ID", ""),
  SPOTIFY_CLIENT_SECRET: optional("SPOTIFY_CLIENT_SECRET", ""),
  SPOTIFY_REDIRECT_URI: optional("SPOTIFY_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/spotify/callback"),
  SPOTIFY_TOKEN_ENCRYPTION_KEY: optional("SPOTIFY_TOKEN_ENCRYPTION_KEY", ""),
  DISCORD_CLIENT_ID: optional("DISCORD_CLIENT_ID", ""), DISCORD_CLIENT_SECRET: optional("DISCORD_CLIENT_SECRET", ""),
  DISCORD_REDIRECT_URI: optional("DISCORD_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/discord/callback"),
  DISCORD_TOKEN_ENCRYPTION_KEY: optional("DISCORD_TOKEN_ENCRYPTION_KEY", ""),
  MICROSOFT_CLIENT_ID: optional("MICROSOFT_CLIENT_ID", ""),
  MICROSOFT_CLIENT_SECRET: optional("MICROSOFT_CLIENT_SECRET", ""),
  MICROSOFT_REDIRECT_URI: optional("MICROSOFT_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/microsoft/callback"),
  MICROSOFT_TOKEN_ENCRYPTION_KEY: optional("MICROSOFT_TOKEN_ENCRYPTION_KEY", ""),
  GITHUB_CLIENT_ID: optional("GITHUB_CLIENT_ID", ""),
  GITHUB_CLIENT_SECRET: optional("GITHUB_CLIENT_SECRET", ""),
  GITHUB_REDIRECT_URI: optional("GITHUB_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/github/callback"),
  GITHUB_TOKEN_ENCRYPTION_KEY: optional("GITHUB_TOKEN_ENCRYPTION_KEY", ""),
  X_CLIENT_ID: optional("X_CLIENT_ID", ""), X_CLIENT_SECRET: optional("X_CLIENT_SECRET", ""),
  X_REDIRECT_URI: optional("X_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/x/callback"),
  X_TOKEN_ENCRYPTION_KEY: optional("X_TOKEN_ENCRYPTION_KEY", ""),
  INSTAGRAM_CLIENT_ID: optional("INSTAGRAM_CLIENT_ID", ""), INSTAGRAM_CLIENT_SECRET: optional("INSTAGRAM_CLIENT_SECRET", ""),
  INSTAGRAM_REDIRECT_URI: optional("INSTAGRAM_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/instagram/callback"), INSTAGRAM_TOKEN_ENCRYPTION_KEY: optional("INSTAGRAM_TOKEN_ENCRYPTION_KEY", ""),
  TIKTOK_CLIENT_KEY: optional("TIKTOK_CLIENT_KEY", ""), TIKTOK_CLIENT_SECRET: optional("TIKTOK_CLIENT_SECRET", ""),
  TIKTOK_REDIRECT_URI: optional("TIKTOK_REDIRECT_URI", "https://auth.max-ai.name.ng/api/v1/connected-accounts/tiktok/callback"), TIKTOK_TOKEN_ENCRYPTION_KEY: optional("TIKTOK_TOKEN_ENCRYPTION_KEY", ""),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: parseInt(optional("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", "24"), 10), PASSWORD_RESET_TOKEN_TTL_MINUTES: parseInt(optional("PASSWORD_RESET_TOKEN_TTL_MINUTES", "30"), 10),
  COOKIE_DOMAIN: cookieDomain,
  COOKIE_SECURE: optional("COOKIE_SECURE", isHttpsApp || isProduction ? "true" : "false") === "true",
  COOKIE_SAME_SITE: optional("COOKIE_SAME_SITE", "strict") as "strict" | "lax" | "none", REFRESH_COOKIE_NAME: optional("REFRESH_COOKIE_NAME", "max_refresh_token"), CSRF_SECRET: requiredSecret("CSRF_SECRET", 32),
  RATE_LIMIT_WINDOW_MINUTES: parseInt(optional("RATE_LIMIT_WINDOW_MINUTES", "15"), 10), RATE_LIMIT_MAX_REQUESTS: parseInt(optional("RATE_LIMIT_MAX_REQUESTS", "100"), 10), LOGIN_RATE_LIMIT_MAX: parseInt(optional("LOGIN_RATE_LIMIT_MAX", "10"), 10), LOGIN_RATE_LIMIT_WINDOW_MINUTES: parseInt(optional("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "15"), 10),
  CORS_ALLOWED_ORIGINS: optional("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",").map((s) => s.trim()),
  ARGON2_MEMORY_COST: parseInt(optional("ARGON2_MEMORY_COST", "19456"), 10), ARGON2_TIME_COST: parseInt(optional("ARGON2_TIME_COST", "2"), 10), ARGON2_PARALLELISM: parseInt(optional("ARGON2_PARALLELISM", "1"), 10),
  MAIL_FROM: optional("MAIL_FROM", "MAX Auth <no-reply@max-ai.name.ng>"), MAIL_PROVIDER: optional("MAIL_PROVIDER", isProduction ? "resend" : "console"), RESEND_API_KEY: optional("RESEND_API_KEY", ""),
  OAUTH_AUTH_CODE_TTL_MINUTES: parseInt(optional("OAUTH_AUTH_CODE_TTL_MINUTES", "10"), 10), OAUTH_ACCESS_TOKEN_TTL_MINUTES: parseInt(optional("OAUTH_ACCESS_TOKEN_TTL_MINUTES", "60"), 10), OAUTH_REFRESH_TOKEN_TTL_DAYS: parseInt(optional("OAUTH_REFRESH_TOKEN_TTL_DAYS", "30"), 10), OAUTH_REFRESH_TOKEN_ABSOLUTE_TTL_DAYS: parseInt(optional("OAUTH_REFRESH_TOKEN_ABSOLUTE_TTL_DAYS", "365"), 10),
  OIDC_ISSUER: optional("OIDC_ISSUER", process.env.APP_URL ?? "http://localhost:4000"), OIDC_KEY_ID: optional("OIDC_KEY_ID", "max-auth-1"), OIDC_PRIVATE_KEY: optional("OIDC_PRIVATE_KEY", ""), OIDC_PUBLIC_KEY: optional("OIDC_PUBLIC_KEY", ""), OIDC_ID_TOKEN_TTL_SECONDS: parseInt(optional("OIDC_ID_TOKEN_TTL_SECONDS", "600"), 10),
  LOG_LEVEL: optional("LOG_LEVEL", "info"), LOG_DIR: optional("LOG_DIR", "logs"),
  get isProduction() { return this.NODE_ENV === "production"; },
};

if (![env.SESSION_IDLE_TIMEOUT_DAYS, env.SESSION_ABSOLUTE_TIMEOUT_DAYS, env.OAUTH_REFRESH_TOKEN_ABSOLUTE_TTL_DAYS].every((value) => Number.isInteger(value) && value > 0)) {
  throw new Error("Session idle and absolute lifetime settings must be positive whole numbers of days.");
}

if (env.SESSION_IDLE_TIMEOUT_DAYS > env.SESSION_ABSOLUTE_TIMEOUT_DAYS) {
  throw new Error("SESSION_IDLE_TIMEOUT_DAYS cannot exceed SESSION_ABSOLUTE_TIMEOUT_DAYS.");
}

if (env.isProduction) {
  if (!env.WEBHOOK_ENCRYPTION_KEY || Buffer.byteLength(env.WEBHOOK_ENCRYPTION_KEY, "utf8") < 32) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY must be set to a stable random secret of at least 32 bytes in production.");
  }
  if (!env.COOKIE_SECURE || !["strict", "lax", "none"].includes(env.COOKIE_SAME_SITE)) {
    throw new Error("Production cookies must be Secure and COOKIE_SAME_SITE must be strict, lax, or none.");
  }
  if (!env.OIDC_ISSUER.startsWith("https://")) {
    throw new Error("OIDC_ISSUER must use HTTPS in production.");
  }
  if (!env.APP_URL.startsWith("https://") || !env.FRONTEND_URL.startsWith("https://")) {
    throw new Error("APP_URL and FRONTEND_URL must use HTTPS in production.");
  }
  if (!env.OIDC_PRIVATE_KEY || !env.OIDC_PUBLIC_KEY) {
    throw new Error("OIDC_PRIVATE_KEY and OIDC_PUBLIC_KEY are required in production for OAuth/OIDC signing and JWKS.");
  }
  if (env.MAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY) {
    throw new Error("Production email delivery requires MAIL_PROVIDER=resend and RESEND_API_KEY.");
  }
  if (Buffer.byteLength(env.JWT_ACCESS_SECRET, "utf8") < 32 || Buffer.byteLength(env.JWT_REFRESH_SECRET, "utf8") < 32 ||
      env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct cryptographically strong secrets of at least 32 bytes.");
  }
}

if (env.isProduction && !env.MAX_AUTH_SERVICE_TOKEN) {
  throw new Error("Missing required environment variable: MAX_AUTH_SERVICE_TOKEN");
}
