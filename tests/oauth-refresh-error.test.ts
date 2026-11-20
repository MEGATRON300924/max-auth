import { AppError } from "../src/utils/AppError";
import { isInvalidOAuthRefreshGrant } from "../src/utils/oauthRefreshError";

describe("isInvalidOAuthRefreshGrant", () => {
  it("recognises Google's explicit invalid_grant response", () => {
    expect(isInvalidOAuthRefreshGrant(
      AppError.badRequest("Token has been expired or revoked", "GOOGLE_REQUEST_FAILED", {
        status: 400,
        error: "invalid_grant",
      }),
    )).toBe(true);
  });

  it("recognises Spotify's explicit invalid_grant response", () => {
    expect(isInvalidOAuthRefreshGrant(
      AppError.badRequest("invalid_grant", "SPOTIFY_REQUEST_FAILED", {
        status: 400,
        providerError: "invalid_grant",
      }),
    )).toBe(true);
  });

  it("does not classify provider rate limits as revoked credentials", () => {
    expect(isInvalidOAuthRefreshGrant(
      AppError.badRequest("Too many requests", "SPOTIFY_REQUEST_FAILED", {
        status: 429,
        providerError: "slow_down",
      }),
    )).toBe(false);
  });

  it("does not classify provider outages as revoked credentials", () => {
    expect(isInvalidOAuthRefreshGrant(
      AppError.badRequest("Service unavailable", "GOOGLE_REQUEST_FAILED", {
        status: 503,
        error: "backendError",
      }),
    )).toBe(false);
  });

  it("does not classify invalid client configuration as a user reconnect issue", () => {
    expect(isInvalidOAuthRefreshGrant(
      AppError.badRequest("Invalid client", "GOOGLE_REQUEST_FAILED", {
        status: 401,
        error: "invalid_client",
      }),
    )).toBe(false);
  });

  it("does not infer revocation from vague error messages", () => {
    expect(isInvalidOAuthRefreshGrant(
      AppError.badRequest("Unauthorized: refresh token request failed", "SPOTIFY_REQUEST_FAILED", {
        status: 500,
        providerError: "server_error",
      }),
    )).toBe(false);
  });

  it("ignores unrelated errors", () => {
    expect(isInvalidOAuthRefreshGrant(new Error("invalid_grant"))).toBe(false);
  });
});
