import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const MAX_LOGO_BYTES = 512 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUTH_BASE_URL = (process.env.PUBLIC_AUTH_URL || "https://auth.max-ai.name.ng").replace(/\/$/, "");

function matchesImageSignature(data: Buffer, contentType: string) {
  if (contentType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/webp") return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  return false;
}

async function ownedClient(ownerId: string, clientId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM oauth_clients WHERE "clientId" = $1 AND "ownerId" = $2::uuid LIMIT 1`, clientId, ownerId);
  if (!rows[0]) throw AppError.notFound("OAuth client not found");
  return rows[0].id;
}

export const oauthClientLogoService = {
  async upload(ownerId: string, clientId: string, contentType: string, base64Data: string) {
    const dbId = await ownedClient(ownerId, clientId);
    const normalizedType = contentType.toLowerCase().trim();
    if (!ALLOWED_TYPES.has(normalizedType)) throw AppError.badRequest("Logo must be PNG, JPEG, or WebP", "UNSUPPORTED_LOGO_TYPE");
    const dataUrlType = base64Data.match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase();
    if (dataUrlType && dataUrlType !== normalizedType) throw AppError.badRequest("Logo content type does not match the uploaded data", "LOGO_CONTENT_TYPE_MISMATCH");
    const clean = base64Data.replace(/^data:[^;]+;base64,/i, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 === 1) throw AppError.badRequest("Logo data must be valid base64", "INVALID_LOGO_DATA");
    const data = Buffer.from(clean, "base64");
    if (!data.length || data.length > MAX_LOGO_BYTES) throw AppError.badRequest("Logo must be 512 KB or smaller", "LOGO_TOO_LARGE");
    if (!matchesImageSignature(data, normalizedType)) throw AppError.badRequest("Uploaded data is not a valid PNG, JPEG, or WebP image", "INVALID_LOGO_CONTENT");
    const logoUrl = `${AUTH_BASE_URL}/api/v1/oauth/clients/${encodeURIComponent(clientId)}/logo`;
    await prisma.$executeRawUnsafe(`UPDATE oauth_client_configs SET logo_data = $1::bytea, logo_content_type = $2, logo_url = $3, updated_at = CURRENT_TIMESTAMP WHERE client_id = $4::uuid`, data, normalizedType, logoUrl, dbId);
    return { logoUrl };
  },
  async remove(ownerId: string, clientId: string) {
    const dbId = await ownedClient(ownerId, clientId);
    await prisma.$executeRawUnsafe(`UPDATE oauth_client_configs SET logo_data = NULL, logo_content_type = NULL, logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE client_id = $1::uuid`, dbId);
  },
  async publicLogo(clientId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ data: Buffer; contentType: string }>>(`SELECT logo_data AS data, logo_content_type AS "contentType" FROM oauth_client_configs WHERE client_id = (SELECT id FROM oauth_clients WHERE "clientId" = $1 AND "isActive" = true LIMIT 1) AND logo_data IS NOT NULL LIMIT 1`, clientId);
    return rows[0] ?? null;
  },
};
