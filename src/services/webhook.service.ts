import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import { prisma } from "../database/prisma";

export const WEBHOOK_EVENTS = [
  "webhook.test",
  "user.created",
  "user.login",
  "oauth.consent.granted",
  "oauth.consent.revoked",
  "oauth.client.created",
  "oauth.client.revoked",
  "oauth.token.revoked",
] as const;

const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_CLAIM_LEASE_MS = 2 * 60 * 1000;

function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function generateSecret() {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
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
    if (net.isIP(mappedIpv4) === 4) return isPrivateIpv4(mappedIpv4);
    return true;
  }
  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  // Only globally routable unicast space (2000::/3) is accepted.
  if (!Number.isFinite(firstHextet) || firstHextet < 0x2000 || firstHextet > 0x3fff) return true;
  if (normalized.startsWith("2001:db8:")) return true; // documentation range
  return false;
}

async function validateUrl(rawUrl: string): Promise<{ url: string; address: string; family: 4 | 6 }> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");
  if (url.username || url.password) throw new Error("Webhook URL must not contain credentials");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (["localhost", "localhost.localdomain"].includes(hostname.toLowerCase())) throw new Error("Webhook URL cannot target localhost");
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => entry.family === 4 ? isPrivateIpv4(entry.address) : isPrivateIpv6(entry.address))) {
    throw new Error("Webhook URL resolves to a private, reserved, or local address");
  }
  const selected = addresses[0];
  return { url: url.toString(), address: selected.address, family: selected.family as 4 | 6 };
}

function encryptionKey() {
  return crypto.createHash("sha256").update(process.env.WEBHOOK_ENCRYPTION_KEY || process.env.JWT_REFRESH_SECRET || "").digest();
}

function encryptSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted webhook secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function signatureFor(secret: string, timestamp: string, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

async function postWebhook(target: { url: string; address: string; family: 4 | 6 }, body: string, headers: Record<string, string>) {
  const url = new URL(target.url);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = https.request({
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: { ...headers, host: url.host, "content-length": String(Buffer.byteLength(body)) },
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      // Pin the connection to the exact address that passed the SSRF checks.
      // This prevents a second DNS resolution from being rebound to a private IP.
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (size < 1000) {
          const remaining = 1000 - size;
          chunks.push(buffer.subarray(0, remaining));
          size += Math.min(buffer.length, remaining);
        }
      });
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    request.setTimeout(10_000, () => request.destroy(new Error("Webhook request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

async function getOwnedEndpoint(userId: string, endpointId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id, user_id, name, url, active, created_at, updated_at FROM webhook_endpoints WHERE id = $1 AND user_id = $2 LIMIT 1`, endpointId, userId);
  return rows[0] ?? null;
}

async function sendDelivery(endpoint: { id: string; url: string; secretHash: string; secretEncrypted?: string | null }, delivery: { id: string; eventType: string; eventId: string; body: string; attemptCount: number }) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signingSecret = endpoint.secretEncrypted ? decryptSecret(endpoint.secretEncrypted) : endpoint.secretHash;
  const signature = signatureFor(signingSecret, timestamp, delivery.body);
  try {
    // Revalidate the destination immediately before every delivery so a DNS change
    // after endpoint creation/update cannot silently bypass the URL policy.
    const target = await validateUrl(endpoint.url);
    const response = await postWebhook(target, delivery.body, {
      "content-type": "application/json",
      "user-agent": "MAX-Webhooks/1.0",
      "x-max-event": delivery.eventType,
      "x-max-event-id": delivery.eventId,
      "x-max-timestamp": timestamp,
      "x-max-signature": `t=${timestamp},v1=${signature}`,
    });
    const responseBody = response.body;
    if (response.status >= 200 && response.status < 300) {
      await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = 'delivered', response_status = $1, response_body = $2, delivered_at = CURRENT_TIMESTAMP, next_attempt_at = NULL WHERE id = $3`, response.status, responseBody, delivery.id);
      return { deliveryId: delivery.id, status: response.status };
    }
    const exhausted = delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS;
    const delaySeconds = Math.min(3600, 60 * 2 ** Math.max(0, delivery.attemptCount - 1));
    await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = $1, response_status = $2, response_body = $3, next_attempt_at = $4 WHERE id = $5`, exhausted ? "failed" : "retrying", response.status, responseBody, exhausted ? null : new Date(Date.now() + delaySeconds * 1000), delivery.id);
    return { deliveryId: delivery.id, status: response.status };
  } catch (error) {
    const exhausted = delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS;
    const delaySeconds = Math.min(3600, 60 * 2 ** Math.max(0, delivery.attemptCount - 1));
    await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = $1, response_body = $2, next_attempt_at = $3 WHERE id = $4`, exhausted ? "failed" : "retrying", String(error).slice(0, 1000), exhausted ? null : new Date(Date.now() + delaySeconds * 1000), delivery.id);
    return { deliveryId: delivery.id, status: null };
  }
}

export const webhookService = {
  events: WEBHOOK_EVENTS,

  async list(userId: string) {
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT e.id, e.name, e.url, e.active, e.created_at, e.updated_at,
             COALESCE(json_agg(json_build_object('id', s.id, 'eventType', s.event_type, 'active', s.active)) FILTER (WHERE s.id IS NOT NULL), '[]') AS subscriptions,
             (SELECT COUNT(*)::int FROM webhook_deliveries d WHERE d.endpoint_id = e.id) AS delivery_count
      FROM webhook_endpoints e
      LEFT JOIN webhook_subscriptions s ON s.endpoint_id = e.id
      WHERE e.user_id = $1
      GROUP BY e.id
      ORDER BY e.created_at DESC`, userId);
  },

  async create(userId: string, name: string, rawUrl: string, events: string[]) {
    const cleanName = name.trim().slice(0, 100);
    if (!cleanName) throw new Error("Webhook name is required");
    const { url } = await validateUrl(rawUrl.trim());
    const selected = [...new Set(events)].filter((event) => WEBHOOK_EVENTS.includes(event as typeof WEBHOOK_EVENTS[number]));
    if (!selected.length) throw new Error("Select at least one supported event");
    const secret = generateSecret();
    const endpointRows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO webhook_endpoints (user_id, name, url, secret_hash, secret_encrypted) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, url, active, created_at, updated_at`, userId, cleanName, url, hashSecret(secret), encryptSecret(secret));
    const endpoint = endpointRows[0];
    for (const event of selected) await prisma.$executeRawUnsafe(`INSERT INTO webhook_subscriptions (endpoint_id, event_type) VALUES ($1, $2)`, endpoint.id, event);
    return { ...endpoint, subscriptions: selected.map((event) => ({ eventType: event, active: true })), secret };
  },

  async update(userId: string, endpointId: string, input: { name?: string; url?: string; active?: boolean; events?: string[] }) {
    const endpoint = await getOwnedEndpoint(userId, endpointId);
    if (!endpoint) throw new Error("Webhook endpoint not found");
    const url = input.url === undefined ? endpoint.url : (await validateUrl(input.url.trim())).url;
    const name = input.name === undefined ? endpoint.name : input.name.trim().slice(0, 100);
    if (!name) throw new Error("Webhook name is required");
    const active = input.active === undefined ? endpoint.active : Boolean(input.active);
    await prisma.$executeRawUnsafe(`UPDATE webhook_endpoints SET name = $1, url = $2, active = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND user_id = $5`, name, url, active, endpointId, userId);
    if (input.events) {
      const selected = [...new Set(input.events)].filter((event) => WEBHOOK_EVENTS.includes(event as typeof WEBHOOK_EVENTS[number]));
      if (!selected.length) throw new Error("Select at least one supported event");
      await prisma.$executeRawUnsafe(`DELETE FROM webhook_subscriptions WHERE endpoint_id = $1`, endpointId);
      for (const event of selected) await prisma.$executeRawUnsafe(`INSERT INTO webhook_subscriptions (endpoint_id, event_type) VALUES ($1, $2)`, endpointId, event);
    }
    return (await this.list(userId)).find((item) => item.id === endpointId);
  },

  async rotateSecret(userId: string, endpointId: string) {
    const endpoint = await getOwnedEndpoint(userId, endpointId);
    if (!endpoint) throw new Error("Webhook endpoint not found");
    const secret = generateSecret();
    await prisma.$executeRawUnsafe(`UPDATE webhook_endpoints SET secret_hash = $1, secret_encrypted = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4`, hashSecret(secret), encryptSecret(secret), endpointId, userId);
    return { secret };
  },

  async remove(userId: string, endpointId: string) {
    const result = await prisma.$executeRawUnsafe(`DELETE FROM webhook_endpoints WHERE id = $1 AND user_id = $2`, endpointId, userId);
    if (Number(result) === 0) throw new Error("Webhook endpoint not found");
  },

  async deliveries(userId: string, endpointId: string) {
    if (!(await getOwnedEndpoint(userId, endpointId))) throw new Error("Webhook endpoint not found");
    return prisma.$queryRawUnsafe<any[]>(`SELECT id, event_type AS "eventType", event_id AS "eventId", attempt_count AS "attemptCount", status, response_status AS "responseStatus", response_body AS "responseBody", next_attempt_at AS "nextAttemptAt", delivered_at AS "deliveredAt", created_at AS "createdAt" FROM webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT 100`, endpointId);
  },

  async deliver(endpointId: string, eventType: string, payload: unknown) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id, url, secret_hash AS "secretHash", secret_encrypted AS "secretEncrypted" FROM webhook_endpoints WHERE id = $1 AND active = true LIMIT 1`, endpointId);
    const endpoint = rows[0];
    if (!endpoint) return null;
    const subscriptions = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM webhook_subscriptions WHERE endpoint_id = $1 AND event_type = $2 AND active = true LIMIT 1`, endpointId, eventType);
    if (!subscriptions.length) return null;
    const eventId = `evt_${crypto.randomBytes(18).toString("base64url")}`;
    const body = JSON.stringify({ id: eventId, type: eventType, createdAt: new Date().toISOString(), data: payload });
    const deliveryRows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO webhook_deliveries (endpoint_id, event_type, event_id, payload, attempt_count, status) VALUES ($1, $2, $3, $4::jsonb, 1, 'retrying') RETURNING id`, endpointId, eventType, eventId, body);
    return sendDelivery({ id: endpoint.id, url: endpoint.url, secretHash: endpoint.secretHash, secretEncrypted: endpoint.secretEncrypted }, { id: deliveryRows[0].id, eventType, eventId, body, attemptCount: 1 });
  },

  async retryPending(limit = 25) {
    // Recover deliveries whose worker lease expired after a process crash.
    await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = 'retrying' WHERE status = 'processing' AND next_attempt_at IS NOT NULL AND next_attempt_at <= CURRENT_TIMESTAMP`);

    const deliveries = await prisma.$queryRawUnsafe<any[]>(`
      SELECT d.id, d.endpoint_id AS "endpointId", d.event_type AS "eventType", d.event_id AS "eventId", d.payload::text AS body,
             d.attempt_count AS "attemptCount", e.url, e.secret_hash AS "secretHash", e.secret_encrypted AS "secretEncrypted"
      FROM webhook_deliveries d
      JOIN webhook_endpoints e ON e.id = d.endpoint_id
      WHERE e.active = true
        AND d.status = 'retrying'
        AND d.next_attempt_at IS NOT NULL
        AND d.next_attempt_at <= CURRENT_TIMESTAMP
        AND d.attempt_count < $1
      ORDER BY d.next_attempt_at ASC
      LIMIT $2`, MAX_DELIVERY_ATTEMPTS, limit);

    let claimed = 0;
    for (const delivery of deliveries) {
      // Atomically claim the row so multiple MAX Auth instances cannot send the
      // same retry concurrently. The short lease also makes crashed claims recoverable.
      const claimRows = await prisma.$queryRawUnsafe<any[]>(`UPDATE webhook_deliveries SET status = 'processing', next_attempt_at = $1 WHERE id = $2 AND status = 'retrying' RETURNING id`, new Date(Date.now() + DELIVERY_CLAIM_LEASE_MS), delivery.id);
      if (!claimRows.length) continue;
      claimed += 1;

      await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET attempt_count = attempt_count + 1 WHERE id = $1 AND status = 'processing'`, delivery.id);
      await sendDelivery(
        { id: delivery.endpointId, url: delivery.url, secretHash: delivery.secretHash, secretEncrypted: delivery.secretEncrypted },
        { id: delivery.id, eventType: delivery.eventType, eventId: delivery.eventId, body: delivery.body, attemptCount: delivery.attemptCount + 1 },
      );
    }
    return claimed;
  },
};
