import { AppError } from "./AppError";

/**
 * A provider refresh token is known to be unusable only when the OAuth token
 * endpoint explicitly returns invalid_grant. Network failures, rate limits,
 * server errors, invalid client configuration, and unrelated API 401/403
 * responses must not force users through OAuth again.
 */
export function isInvalidOAuthRefreshGrant(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  if (error.code !== "GOOGLE_REQUEST_FAILED" && error.code !== "SPOTIFY_REQUEST_FAILED") {
    return false;
  }

  if (!error.details || typeof error.details !== "object") return false;
  const details = error.details as { error?: unknown; providerError?: unknown };
  return details.error === "invalid_grant" || details.providerError === "invalid_grant";
}
