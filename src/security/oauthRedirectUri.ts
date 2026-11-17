import { AppError } from "../utils/AppError";

export function normalizeRedirectUris(values: string[]) {
  const redirectUris = [...new Set(values.map((value) => new URL(value).toString()))];
  for (const uri of redirectUris) {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password || parsed.hash) {
      throw AppError.badRequest("Redirect URIs must not contain credentials or fragments", "INVALID_REDIRECT_URI");
    }
    if (parsed.protocol === "http:") {
      if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
        throw AppError.badRequest("Production redirect URIs must use HTTPS", "INVALID_REDIRECT_URI");
      }
      continue;
    }
    if (parsed.protocol === "https:") continue;
    const blockedProtocols = new Set(["javascript:", "data:", "file:", "ftp:", "ws:", "wss:", "blob:", "mailto:", "tel:"]);
    if (blockedProtocols.has(parsed.protocol)) {
      throw AppError.badRequest("This redirect URI scheme is not allowed", "INVALID_REDIRECT_URI");
    }
  }
  return redirectUris;
}
