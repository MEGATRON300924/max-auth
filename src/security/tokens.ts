import crypto from "crypto";

/**
 * Generates a cryptographically secure random opaque token (URL-safe).
 * Used for email verification links, password reset links, recovery codes.
 */
export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Deterministic SHA-256 hash of a token for storage.
 * We NEVER store raw tokens (refresh tokens, verification tokens, reset tokens)
 * in the database — only their hash, similar to password storage best-practice
 * for high-entropy secrets (HMAC/SHA-256 is fine here since these are already
 * high-entropy random values, not user-chosen passwords).
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateNumericCode(length = 6): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[crypto.randomInt(0, digits.length)];
  }
  return code;
}
