import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { prisma } from "../database/prisma";

export const WEBHOOK_EVENTS = [
  "user.created",
  "user.login",
  "oauth.consent.granted",
  "oauth.consent.revoked",
  "oauth.client.created",
  "oauth.client.revoked",
  "oauth.token.revoked",
] as const;

function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function generateSecret() {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

function isPrivateIpv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function validateUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");
  if (url.username || url.password) throw new Error("Webhook URL must not contain credentials");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (["localhost", "localhost.localdomain"].includes(hostname.toLowerCase())) throw new Error("Webhook URL cannot target localhost");
  const addresses = net.isIP(hostname) ? [hostname] : (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);
  if (!addresses.length || addresses.some((ip) => net.isIPv4(ip) ? isPrivateIpv4(ip) : isPrivateIpv6(ip))) throw new Error("Webhook URL resolves to a private or local address");
  return url.toString();
}

function safeJson(value: unknown) {
  return JSON.stringify(value);
}

async function getOwnedEndpoint(userId: string, endpointId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, user_id, name, url, active, created_at, updated_at FROM webhook_endpoints WHERE id = $1 AND user_id = $2 LIMIT 1`, endpointId, userId
  );
  return rows[0] ?? null;
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
    const url = await validateUrl(rawUrl.trim());
    const selected = [...new Set(events)].filter((event) => WEBHOOK_EVENTS.includes(event as typeof WEBHOOK_EVENTS[number]));
    if (!selected.length) throw new Error("Select at least one supported event");
    const secret = generateSecret();
    const hash = hashSecret(secret);
    const endpointRows = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO webhook_endpoints (user_id, name, url, secret_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, url, active, created_at, updated_at`, userId, cleanName, url, hash
    );
    const endpoint = endpointRows[0];
    for (const event of selected) {
      await prisma.$executeRawUnsafe(`INSERT INTO webhook_subscriptions (endpoint_id, event_type) VALUES ($1, $2)`, endpoint.id, event);
    }
    return { ...endpoint, subscriptions: selected.map((event) => ({ eventType: event, active: true })), secret };
  },

  async update(userId: string, endpointId: string, input: { name?: string; url?: string; active?: boolean; events?: string[] }) {
    const endpoint = await getOwnedEndpoint(userId, endpointId);
    if (!endpoint) throw new Error("Webhook endpoint not found");
    let url = endpoint.url;
    if (input.url !== undefined) url = await validateUrl(input.url.trim());
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
    await prisma.$executeRawUnsafe(`UPDATE webhook_endpoints SET secret_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`, hashSecret(secret), endpointId, userId);
    return { secret };
  },

  async remove(userId: string, endpointId: string) {
    const result = await prisma.$executeRawUnsafe(`DELETE FROM webhook_endpoints WHERE id = $1 AND user_id = $2`, endpointId, userId);
    if (Number(result) === 0) throw new Error("Webhook endpoint not found");
  },

  async deliveries(userId: string, endpointId: string) {
    const endpoint = await getOwnedEndpoint(userId, endpointId);
    if (!endpoint) throw new Error("Webhook endpoint not found");
    return prisma.$queryRawUnsafe<any[]>(`SELECT id, event_type AS "eventType", event_id AS "eventId", attempt_count AS "attemptCount", status, response_status AS "responseStatus", response_body AS "responseBody", next_attempt_at AS "nextAttemptAt", delivered_at AS "deliveredAt", created_at AS "createdAt" FROM webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT 100`, endpointId);
  },

  async deliver(endpointId: string, eventType: string, payload: unknown) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id, url, secret_hash AS "secretHash" FROM webhook_endpoints WHERE id = $1 AND active = true LIMIT 1`, endpointId);
    const endpoint = rows[0];
    if (!endpoint) return null;
    const subscriptions = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM webhook_subscriptions WHERE endpoint_id = $1 AND event_type = $2 AND active = true LIMIT 1`, endpointId, eventType);
    if (!subscriptions.length) return null;

    const eventId = `evt_${crypto.randomBytes(18).toString("base64url")}`;
    const body = safeJson({ id: eventId, type: eventType, createdAt: new Date().toISOString(), data: payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const deliveryRows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO webhook_deliveries (endpoint_id, event_type, event_id, payload, attempt_count) VALUES ($1, $2, $3, $4::jsonb, 1) RETURNING id`, endpointId, eventType, eventId, body);
    const deliveryId = deliveryRows[0].id;
    const signature = crypto.createHmac("sha256", endpoint.secretHash).update(`${timestamp}.${body}`).digest("hex");
    try {
      const response = await fetch(endpoint.url, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", "user-agent": "MAX-Webhooks/1.0", "x-max-event": eventType, "x-max-event-id": eventId, "x-max-timestamp": timestamp, "x-max-signature": `t=${timestamp},v1=${signature}` }, body, signal: AbortSignal.timeout(10000) });
      const responseBody = (await response.text()).slice(0, 1000);
      if (response.status >= 200 && response.status < 300) {
        await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = 'delivered', response_status = $1, response_body = $2, delivered_at = CURRENT_TIMESTAMP WHERE id = $3`, response.status, responseBody, deliveryId);
      } else {
        await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = 'failed', response_status = $1, response_body = $2, next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '60 seconds' WHERE id = $3`, response.status, responseBody, deliveryId);
      }
      return { deliveryId, status: response.status };
    } catch (error) {
      await prisma.$executeRawUnsafe(`UPDATE webhook_deliveries SET status = 'failed', response_body = $1, next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '60 seconds' WHERE id = $2`, String(error).slice(0, 1000), deliveryId);
      return { deliveryId, status: null };
    }
  },
};
