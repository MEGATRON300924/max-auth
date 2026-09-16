import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const MAX_LOGO_BYTES = 512 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUTH_BASE_URL = (process.env.PUBLIC_AUTH_URL || "https://auth.max-ai.name.ng").replace(/\/$/, "");

async function ownedClient(ownerId: string, clientId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM oauth_clients WHERE client_id = $1 AND owner_id = $2::uuid LIMIT 1`, clientId, ownerId);
  if (!rows[0]) throw AppError.notFound("OAuth client not found");
  return rows[0].id;
}

export const oauthClientLogoService = {
  async upload(ownerId: string, clientId: string, contentType: string, base64Data: string) {
    const dbId = await ownedClient(ownerId, clientId);
    if (!ALLOWED_TYPES.has(contentType)) throw AppError.badRequest("Logo must be PNG, JPEG, or WebP", "UNSUPPORTED_LOGO_TYPE");
    const clean = base64Data.replace(/^data:[^;]+;base64,/, "");
    const data = Buffer.from(clean, "base64");
    if (!data.length || data.length > MAX_LOGO_BYTES) throw AppError.badRequest("Logo must be 512 KB or smaller", "LOGO_TOO_LARGE");
    const logoUrl = `${AUTH_BASE_URL}/api/v1/oauth/clients/${encodeURIComponent(clientId)}/logo`;
    await prisma.$queryRawUnsafe(`UPDATE oauth_client_configs SET logo_data = $1::bytea, logo_content_type = $2, logo_url = $3, updated_at = CURRENT_TIMESTAMP WHERE client_id = $4::uuid`, data, contentType, logoUrl, dbId);
    return { logoUrl };
  },
  async remove(ownerId: string, clientId: string) {
    const dbId = await ownedClient(ownerId, clientId);
    await prisma.$queryRawUnsafe(`UPDATE oauth_client_configs SET logo_data = NULL, logo_content_type = NULL, logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE client_id = $1::uuid`, dbId);
  },
  async publicLogo(clientId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ data: Buffer; contentType: string }>>(`SELECT logo_data AS data, logo_content_type AS "contentType" FROM oauth_client_configs WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1 AND is_active = true LIMIT 1) AND logo_data IS NOT NULL LIMIT 1`, clientId);
    return rows[0] ?? null;
  },
};
