import { AppError } from "../utils/AppError";
import { env } from "../config/env";

const MAX_MEMORY_RESPONSE_BYTES = 256 * 1024;

type MemoryItem = {
  id: string;
  type: string;
  content: string;
  source: string;
  productSource: string;
  confidence: number;
  importance: number;
  isExplicit: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const oauthMemoryService = {
  async getAuthorizedMemory(accessToken: string) {
    if (!accessToken) throw new AppError("Invalid OAuth access token", 401, "INVALID_TOKEN");

    const backendBase = env.MAX_AI_BACKEND_URL.replace(/\\/+$/, "").replace(/\\/api\\/v1$/i, "");
    const memoryUrl = `${backendBase}/api/v1/memory/oauth`;
    let response: Response | undefined;

    // Render free instances can take time to wake after inactivity. Retry only
    // transient network and gateway failures; never retry authorization errors.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(memoryUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok || ![502, 503, 504].includes(response.status) || attempt === 2) break;
      } catch (error) {
        if (attempt === 2) {
          console.error("[MAX Auth] MAX Memory backend request failed", {
            backendHost: (() => { try { return new URL(backendBase).host; } catch { return "invalid-backend-url"; } })(),
            reason: error instanceof Error ? error.name : "unknown",
          });
          throw new AppError("MAX Memory service is unavailable", 503, "MEMORY_SERVICE_UNAVAILABLE");
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }

    if (!response) throw new AppError("MAX Memory service is unavailable", 503, "MEMORY_SERVICE_UNAVAILABLE");
    if (!response.ok) {
      console.error("[MAX Auth] MAX Memory backend returned an unsuccessful response", {
        status: response.status,
        backendHost: (() => { try { return new URL(backendBase).host; } catch { return "invalid-backend-url"; } })(),
      });
      if (response.status === 401) throw new AppError("Invalid OAuth access token", 401, "INVALID_TOKEN");
      if (response.status === 403) throw new AppError("The access token does not include MAX Memory permission", 403, "INSUFFICIENT_SCOPE");
      throw new AppError("MAX Memory service is unavailable", 503, "MEMORY_SERVICE_UNAVAILABLE");
    }

    const payload = await response.json() as { success?: boolean; data?: MemoryItem[] };
    const memories = Array.isArray(payload.data) ? payload.data : [];
    const result = { version: 2, memories };
    const serialized = JSON.stringify(result);

    if (Buffer.byteLength(serialized, "utf8") > MAX_MEMORY_RESPONSE_BYTES) {
      throw new AppError("MAX Memory response is too large", 413, "MEMORY_RESPONSE_TOO_LARGE");
    }

    return result;
  },
};
