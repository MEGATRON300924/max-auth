import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

export const oauthManifestService = {
  async verify(ownerId: string, clientId: string) {
    const client = await prisma.oAuthClient.findFirst({ where: { clientId, ownerId }, select: { id: true, clientId: true, name: true, redirectUris: true } });
    if (!client) throw AppError.notFound("OAuth client not found");
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT manifest_url AS "manifestUrl", website_url AS "websiteUrl", authorized_origins AS "authorizedOrigins", application_type AS "applicationType" FROM oauth_client_configs WHERE client_id = $1::uuid LIMIT 1`, client.id);
    const config = rows[0];
    if (!config?.manifestUrl) throw AppError.badRequest("Add a MAX client manifest URL first", "MANIFEST_URL_REQUIRED");
    const manifest = new URL(config.manifestUrl);
    const allowedHosts = new Set<string>();
    if (config.websiteUrl) allowedHosts.add(new URL(config.websiteUrl).host);
    for (const origin of config.authorizedOrigins ?? []) { try { allowedHosts.add(new URL(origin).host); } catch {} }
    if (!allowedHosts.has(manifest.host)) throw AppError.badRequest("The manifest host must match a registered website", "MANIFEST_HOST_MISMATCH");
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try { response = await fetch(manifest.toString(), { headers: { Accept: "application/json" }, signal: controller.signal, redirect: "error" }); } catch { throw AppError.badRequest("MAX Auth could not reach the manifest", "MANIFEST_FETCH_FAILED"); } finally { clearTimeout(timeout); }
    if (!response.ok) throw AppError.badRequest(`Manifest returned HTTP ${response.status}`, "MANIFEST_FETCH_FAILED");
    let body: any; try { body = await response.json(); } catch { throw AppError.badRequest("Manifest must contain valid JSON", "INVALID_MANIFEST"); }
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((value: unknown): value is string => typeof value === "string") : [];
    const declaredClientId = typeof body.client_id === "string" ? body.client_id : "";
    const declaredWebsite = typeof body.website === "string" ? body.website : "";
    const validClient = declaredClientId === client.clientId;
    const validWebsite = !declaredWebsite || declaredWebsite === config.websiteUrl;
    const validRedirects = redirectUris.length === 0 || redirectUris.every((uri) => client.redirectUris.includes(uri));
    const validPkce = body.authorization?.pkce === "S256";
    const verified = validClient && validWebsite && validRedirects && validPkce;
    await prisma.$executeRawUnsafe(`UPDATE oauth_client_configs SET verification_status = $2, verified_at = CASE WHEN $2 = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE client_id = $1::uuid`, client.id, verified ? "VERIFIED" : "UNVERIFIED");
    return { verified, checks: { clientId: validClient, website: validWebsite, redirectUris: validRedirects, pkce: validPkce }, manifest: body };
  },
};
