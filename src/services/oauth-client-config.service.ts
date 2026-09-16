import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

export const OAUTH_APPLICATION_TYPES = ["WEB", "SPA", "ANDROID", "IOS", "DESKTOP"] as const;
export type OAuthApplicationType = (typeof OAUTH_APPLICATION_TYPES)[number];
export type OAuthVerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED";

export interface OAuthClientConfigInput {
  applicationType: OAuthApplicationType;
  authorizedOrigins?: string[];
  packageName?: string;
  bundleId?: string;
  certificateFingerprints?: string[];
  logoUrl?: string;
  displayName?: string;
  websiteUrl?: string;
  manifestUrl?: string;
}

async function clientDatabaseId(ownerId: string, clientId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM oauth_clients WHERE client_id = $1 AND owner_id = $2::uuid LIMIT 1`, clientId, ownerId);
  if (!rows[0]) throw AppError.notFound("OAuth client not found");
  return rows[0].id;
}

function normalizeOrigins(values: string[] = []) { return [...new Set(values.map((value) => value.trim()).filter(Boolean).map((value) => { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw AppError.badRequest("Authorized sites must use HTTP or HTTPS", "INVALID_AUTHORIZED_SITE"); return `${url.protocol}//${url.host}`; }))]; }
function normalizeFingerprints(values: string[] = []) { return [...new Set(values.map((value) => value.trim().replace(/\s+/g, "").toUpperCase()).filter(Boolean))]; }
function normalizeHttpsUrl(value?: string, field = "URL") { if (!value?.trim()) return null; let url: URL; try { url = new URL(value.trim()); } catch { throw AppError.badRequest(`${field} must be a valid URL`, "INVALID_URL"); } if (url.protocol !== "https:") throw AppError.badRequest(`${field} must use HTTPS`, "INVALID_URL"); return url.toString(); }

export const oauthClientConfigService = {
  async get(ownerId: string, clientId: string) {
    const dbId = await clientDatabaseId(ownerId, clientId);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT application_type AS "applicationType", authorized_origins AS "authorizedOrigins", package_name AS "packageName", bundle_id AS "bundleId", certificate_fingerprints AS "certificateFingerprints", logo_url AS "logoUrl", display_name AS "displayName", website_url AS "websiteUrl", manifest_url AS "manifestUrl", verification_status AS "verificationStatus", verified_at AS "verifiedAt" FROM oauth_client_configs WHERE client_id = $1::uuid LIMIT 1`, dbId);
    return rows[0] ?? { applicationType: "WEB", authorizedOrigins: [], packageName: null, bundleId: null, certificateFingerprints: [], logoUrl: null, displayName: null, websiteUrl: null, manifestUrl: null, verificationStatus: "UNVERIFIED", verifiedAt: null };
  },
  async getPublic(clientId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT display_name AS "displayName", logo_url AS "logoUrl", website_url AS "websiteUrl" FROM oauth_client_configs WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1 AND is_active = true LIMIT 1) LIMIT 1`, clientId);
    return rows[0] ?? { displayName: null, logoUrl: null, websiteUrl: null };
  },
  async upsert(ownerId: string, clientId: string, input: OAuthClientConfigInput) {
    const dbId = await clientDatabaseId(ownerId, clientId);
    const authorizedOrigins = normalizeOrigins(input.authorizedOrigins);
    const certificateFingerprints = normalizeFingerprints(input.certificateFingerprints);
    const logoUrl = normalizeHttpsUrl(input.logoUrl, "Logo URL");
    const websiteUrl = normalizeHttpsUrl(input.websiteUrl, "Website URL");
    const manifestUrl = normalizeHttpsUrl(input.manifestUrl, "Manifest URL");
    const displayName = input.displayName?.trim() || null;
    if (displayName && displayName.length > 100) throw AppError.badRequest("Display name must be 100 characters or fewer", "INVALID_DISPLAY_NAME");
    if ((input.applicationType === "WEB" || input.applicationType === "SPA") && !authorizedOrigins.length) throw AppError.badRequest("Add at least one authorized site", "AUTHORIZED_SITE_REQUIRED");
    if (input.applicationType === "ANDROID" && !input.packageName?.trim()) throw AppError.badRequest("Android package name is required", "PACKAGE_NAME_REQUIRED");
    if (input.applicationType === "IOS" && !input.bundleId?.trim()) throw AppError.badRequest("iOS bundle ID is required", "BUNDLE_ID_REQUIRED");
    const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO oauth_client_configs (client_id, application_type, authorized_origins, package_name, bundle_id, certificate_fingerprints, logo_url, display_name, website_url, manifest_url, verification_status, verified_at, updated_at) VALUES ($1::uuid, $2, $3::text[], $4, $5, $6::text[], $7, $8, $9, $10, CASE WHEN $10 IS NULL THEN 'UNVERIFIED' ELSE 'PENDING' END, NULL, CURRENT_TIMESTAMP) ON CONFLICT (client_id) DO UPDATE SET application_type = EXCLUDED.application_type, authorized_origins = EXCLUDED.authorized_origins, package_name = EXCLUDED.package_name, bundle_id = EXCLUDED.bundle_id, certificate_fingerprints = EXCLUDED.certificate_fingerprints, logo_url = EXCLUDED.logo_url, display_name = EXCLUDED.display_name, website_url = EXCLUDED.website_url, manifest_url = EXCLUDED.manifest_url, verification_status = CASE WHEN EXCLUDED.manifest_url IS NULL THEN 'UNVERIFIED' ELSE 'PENDING' END, verified_at = NULL, updated_at = CURRENT_TIMESTAMP RETURNING application_type AS "applicationType", authorized_origins AS "authorizedOrigins", package_name AS "packageName", bundle_id AS "bundleId", certificate_fingerprints AS "certificateFingerprints", logo_url AS "logoUrl", display_name AS "displayName", website_url AS "websiteUrl", manifest_url AS "manifestUrl", verification_status AS "verificationStatus", verified_at AS "verifiedAt"`, dbId, input.applicationType, authorizedOrigins, input.packageName?.trim() || null, input.bundleId?.trim() || null, certificateFingerprints, logoUrl, displayName, websiteUrl, manifestUrl);
    return rows[0];
  },
  async publicClientTest(clientId: string, redirectUri?: string, requestedScopes: string[] = []) {
    const client = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { clientId: true, name: true, redirectUris: true, scopes: true, isActive: true } });
    if (!client) return { valid: false, clientId, checks: [{ key: "client", label: "Client ID", ok: false, detail: "Client ID was not found." }] };
    const config = await this.getPublic(clientId);
    const configExists = config.displayName !== null || config.logoUrl !== null || config.websiteUrl !== null;
    const checks: Array<{ key: string; label: string; ok: boolean; detail: string }> = [];
    checks.push({ key: "client", label: "Client ID", ok: client.isActive, detail: client.isActive ? "Client is registered and active." : "Client is revoked." });
    if (redirectUri) checks.push({ key: "redirect", label: "Redirect URI", ok: client.redirectUris.includes(redirectUri), detail: client.redirectUris.includes(redirectUri) ? "Redirect URI matches exactly." : "Redirect URI is not registered." });
    const unsupported = requestedScopes.filter((scope) => !client.scopes.includes(scope));
    checks.push({ key: "scopes", label: "Permissions", ok: unsupported.length === 0, detail: unsupported.length ? `Not allowed: ${unsupported.join(", ")}` : "Requested permissions are allowed." });
    checks.push({ key: "config", label: "Client configuration", ok: configExists, detail: configExists ? "Client configuration loaded." : "No branding configuration has been saved yet." });
    return { valid: client.isActive && checks.every((check) => check.ok), client: { clientId: client.clientId, name: config.displayName || client.name, websiteUrl: config.websiteUrl || null, logoUrl: config.logoUrl || null }, checks, allowedScopes: client.scopes, redirectUris: client.redirectUris };
  },
};
