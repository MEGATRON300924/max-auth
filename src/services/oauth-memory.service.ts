import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const MAX_MEMORY_RESPONSE_BYTES = 256 * 1024;

type MemoryRow = {
  id: string;
  type: string;
  content: string;
  source: string | null;
  product_source: string | null;
  confidence: number | null;
  importance: number;
  is_explicit: boolean;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

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
  async getAuthorizedMemory(userId: string) {
    if (!userId) throw new AppError("Invalid OAuth access token", 401, "INVALID_TOKEN");

    try {
      // MAX Auth and MAX Backend share the same Supabase database. Read the
      // memory schema directly so OAuth userinfo does not depend on a second
      // public HTTP request to the Render backend service.
      const rows = await prisma.$queryRaw<MemoryRow[]>\`
        SELECT
          m.id::text AS id,
          m.type::text AS type,
          m.value AS content,
          m.source AS source,
          m.product_source AS product_source,
          m.confidence AS confidence,
          m.importance AS importance,
          m.is_explicit AS is_explicit,
          m.expires_at AS expires_at,
          m.created_at AS created_at,
          m.updated_at AS updated_at
        FROM max_backend.memories AS m
        INNER JOIN max_backend.ecosystem_users AS u
          ON u.id = m.user_id
        WHERE u.auth_subject = ${userId}
          AND (m.expires_at IS NULL OR m.expires_at > NOW())
        ORDER BY m.updated_at DESC
        LIMIT 500
      \`;

      const memories: MemoryItem[] = [];
      for (const row of rows) {
        const item: MemoryItem = {
          id: row.id,
          type: row.type,
          content: row.content,
          source: row.source ?? "MAX",
          productSource: row.product_source ?? "max-backend",
          confidence: row.confidence ?? 0.5,
          importance: row.importance,
          isExplicit: row.is_explicit,
          expiresAt: row.expires_at?.toISOString() ?? null,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };

        const candidate = { version: 2, memories: [...memories, item] };
        if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_MEMORY_RESPONSE_BYTES) break;
        memories.push(item);
      }

      return { version: 2, memories };
    } catch (error) {
      console.error("[MAX Auth] Direct MAX Memory database query failed", {
        userId,
        errorName: error instanceof Error ? error.name : "unknown",
        errorCode: typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "unknown")
          : "unknown",
      });
      throw new AppError("MAX Memory service is unavailable", 503, "MEMORY_SERVICE_UNAVAILABLE");
    }
  },
};
