import { Buffer } from "node:buffer";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const MAX_MANIFEST_BYTES = 256 * 1024;

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice(7);
    return net.isIP(mappedIpv4) === 4 ? isPrivateIpv4(mappedIpv4) : true;
  }
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return !Number.isFinite(first) || first < 0x2000 || first > 0x3fff || normalized.startsWith("2001:db8:");
}

async function fetchPublicManifest(url: URL): Promise<{ status: number; contentType: string; contentLength: number; text: string }> {
  if (url.protocol !== "https:") throw AppError.badRequest("Manifest must use HTTPS", "INVALID_MANIFEST_URL");
  if (url.username || url.password) throw AppError.badRequest("Manifest URL must not contain credentials", "INVALID_MANIFEST_URL");
  const hostname = url.hostname.replace(/^\\[|\\]$/g, "");
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => entry.family === 4 ? isPrivateIpv4(entry.address) : isPrivateIpv6(entry.address))) {
    throw AppError.badRequest("Manifest host resolves to a private, reserved, or local address", "MANIFEST_HOST_BLOCKED");
  }
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { accept: "application/json", host: url.host },
      servername: net.isIP(hostname) ? undefined : hostname,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family as 4 | 6),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const contentLength = Number(response.headers["content-length"] || 0);
      const contentType = String(response.headers["content-type"] || "");
      if (contentLength > MAX_MANIFEST_BYTES) {
        response.destroy();
        reject(AppError.badRequest("Manifest is too large", "MANIFEST_TOO_LARGE"));
        return;
      }
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_MANIFEST_BYTES) {
          response.destroy();
          reject(AppError.badRequest("Manifest is too large", "MANIFEST_TOO_LARGE"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        contentType,
        contentLength,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error("Manifest request timed out")));
    request.on("error", reject);
    request.end();
  });
}

export const oauthManifestService = {
  async verify(ownerId: string, clientId: string) {
    const client = await prisma.oAuthClient.findFirst({ where: { clientId, ownerId }, select: { id: true, clientId: true, name: true, redirectUris: true } });
    if (!client) throw AppError.notFound("OAuth client not found");
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT manifest_url AS "manifestUrl", website_url AS "websiteUrl", authorized_origins AS "authorizedOrigins", application_type AS "applicationType" FROM oauth_client_configs WHERE client_id = $1::uuid LIMIT 1`, client.id);
    const config = rows[0];
    if (!config?.manifestUrl) throw AppError.badRequest("Add a MAX client manifest URL first", "MANIFEST_URL_REQUIRED");
    if (!config.websiteUrl) throw AppError.badRequest("Add the client website URL before verifying the manifest", "WEBSITE_URL_REQUIRED");
    const manifest = new URL(config.manifestUrl);
    const website = new URL(config.websiteUrl);
    const allowedHosts = new Set<string>([website.host]);
    for (const origin of config.authorizedOrigins ?? []) { try { allowedHosts.add(new URL(origin).host); } catch {} }
    if (!allowedHosts.has(manifest.host)) throw AppError.badRequest("The manifest host must match a registered website", "MANIFEST_HOST_MISMATCH");
    let response: { status: number; contentType: string; contentLength: number; text: string };
    try {
      response = await fetchPublicManifest(manifest);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw AppError.badRequest("MAX Auth could not reach the manifest", "MANIFEST_FETCH_FAILED");
    }
    if (response.status < 200 || response.status >= 300) throw AppError.badRequest(`Manifest returned HTTP ${response.status}`, "MANIFEST_FETCH_FAILED");
    if (!response.contentType.toLowerCase().includes("application/json")) throw AppError.badRequest("Manifest must be served as JSON", "INVALID_MANIFEST");
    const text = response.text;
    let body: any;
    try { body = JSON.parse(text); } catch { throw AppError.badRequest("Manifest must contain valid JSON", "INVALID_MANIFEST"); }
    const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((value: unknown): value is string => typeof value === "string") : [];
    const declaredClientId = typeof body.client_id === "string" ? body.client_id : "";
    const declaredWebsite = typeof body.website === "string" ? body.website : "";
    const declaredName = typeof body.name === "string" ? body.name.trim() : "";
    const validClient = declaredClientId === client.clientId;
    const validWebsite = declaredWebsite === config.websiteUrl;
    const validRedirects = redirectUris.length > 0 && redirectUris.length === client.redirectUris.length && redirectUris.every((uri: string) => client.redirectUris.includes(uri));
    const validPkce = body.authorization?.pkce === "S256";
    const validName = !declaredName || declaredName === client.name;
    const verified = validClient && validWebsite && validRedirects && validPkce && validName;
    await prisma.$executeRawUnsafe(`UPDATE oauth_client_configs SET verification_status = $2, verified_at = CASE WHEN $2 = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE client_id = $1::uuid`, client.id, verified ? "VERIFIED" : "UNVERIFIED");
    return { verified, checks: { clientId: validClient, website: validWebsite, redirectUris: validRedirects, pkce: validPkce, name: validName } };
  },
};