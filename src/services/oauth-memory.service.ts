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

    let response: Response;
    try {
      response = await fetch(`${env.MAX_AI_BACKEND_URL.replace(/\/$/, "")}/api/v1/memory/oauth`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      throw new AppError("MAX Memory service is unavailable", 503, "MEMORY_SERVICE_UNAVAILABLE");
    }

    if (!response.ok) {
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
