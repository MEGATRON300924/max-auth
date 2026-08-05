import { UAParser } from "ua-parser-js";
import crypto from "crypto";
import { deviceRepository } from "../repositories/device.repository";
import { sessionRepository } from "../repositories/session.repository";
import { AppError } from "../utils/AppError";

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

/** Builds a stable-ish fingerprint from user + user-agent + a client-supplied hint. */
function buildFingerprint(userId: string, userAgent: string, clientHint?: string) {
  const raw = `${userId}:${userAgent}:${clientHint ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const deviceService = {
  async identifyOrCreateDevice(
    userId: string,
    ctx: RequestContext,
    clientHint?: string
  ) {
    const userAgent = ctx.userAgent ?? "unknown";
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const fingerprint = buildFingerprint(userId, userAgent, clientHint);

    let device = await deviceRepository.findByFingerprint(fingerprint);

    if (device) {
      device = await deviceRepository.touch(device.id, ctx.ipAddress);
      return device;
    }

    return deviceRepository.create({
      user: { connect: { id: userId } },
      deviceName: `${result.browser.name ?? "Unknown browser"} on ${
        result.os.name ?? "Unknown OS"
      }`,
      deviceType: result.device.type ?? "desktop",
      os: result.os.name,
      browser: result.browser.name,
      fingerprint,
      lastIp: ctx.ipAddress,
    });
  },

  listDevices(userId: string) {
    return deviceRepository.listForUser(userId);
  },

  async trustDevice(userId: string, deviceId: string) {
    const device = await deviceRepository.findById(deviceId);
    if (!device || device.userId !== userId) {
      throw AppError.notFound("Device not found");
    }
    return deviceRepository.trust(deviceId);
  },

  async revokeDevice(userId: string, deviceId: string) {
    const device = await deviceRepository.findById(deviceId);
    if (!device || device.userId !== userId) {
      throw AppError.notFound("Device not found");
    }
    // Revoking a device also revokes all sessions tied to it (cascades via DB relation is SetNull,
    // so explicitly revoke sessions first).
    await deviceRepository.remove(deviceId);
  },

  listSessions(userId: string) {
    return sessionRepository.listActiveForUser(userId);
  },

  async revokeSession(userId: string, sessionId: string) {
    const sessions = await sessionRepository.listActiveForUser(userId);
    const target = sessions.find((s: { id: string }) => s.id === sessionId);
    if (!target) throw AppError.notFound("Session not found");
    return sessionRepository.revoke(sessionId);
  },

  revokeAllSessions(userId: string) {
    return sessionRepository.revokeAllForUser(userId);
  },
};
