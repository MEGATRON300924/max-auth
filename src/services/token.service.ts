import { randomUUID } from "crypto";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../security/jwt";
import { hashToken } from "../security/tokens";
import { sessionRepository } from "../repositories/session.repository";
import { userRepository } from "../repositories/user.repository";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { User } from "@prisma/client";

function refreshExpiryDate(): Date { return new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN)); }
function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return num * unitMs;
}

export const tokenService = {
  async issueTokenPair(user: Pick<User, "id" | "username" | "subscriptionTier">, ctx: { deviceId?: string; ipAddress?: string; userAgent?: string; rememberMe?: boolean }) {
    const sessionId = randomUUID();
    const rememberMe = ctx.rememberMe !== false;
    const accessToken = signAccessToken({ sub: user.id, username: user.username, tier: user.subscriptionTier, sessionId });
    const refreshToken = signRefreshToken({ sub: user.id, sessionId, rememberMe });
    await sessionRepository.create({ id: sessionId, user: { connect: { id: user.id } }, device: ctx.deviceId ? { connect: { id: ctx.deviceId } } : undefined, refreshTokenHash: hashToken(refreshToken), userAgent: ctx.userAgent, ipAddress: ctx.ipAddress, expiresAt: refreshExpiryDate() });
    return { accessToken, refreshToken, sessionId, rememberMe };
  },
  async rotateRefreshToken(rawRefreshToken: string, ctx: { ipAddress?: string; userAgent?: string }) {
    let payload;
    try { payload = verifyRefreshToken(rawRefreshToken); } catch { throw AppError.unauthorized("Invalid or expired refresh token"); }
    const tokenHash = hashToken(rawRefreshToken);
    const session = await sessionRepository.findByRefreshTokenHash(tokenHash);
    if (!session || session.isRevoked || session.expiresAt < new Date()) throw AppError.unauthorized("Session is no longer valid");
    if (session.userId !== payload.sub || session.id !== payload.sessionId) throw AppError.unauthorized("Token/session mismatch");
    await sessionRepository.revoke(session.id);
    const user = await userRepository.findById(session.userId);
    if (!user || user.status !== "ACTIVE") throw AppError.unauthorized("Account is not active");
    return this.issueTokenPair(user, { deviceId: session.deviceId ?? undefined, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, rememberMe: payload.rememberMe });
  },
  async revokeByRawRefreshToken(rawRefreshToken: string) { const tokenHash = hashToken(rawRefreshToken); const session = await sessionRepository.findByRefreshTokenHash(tokenHash); if (session && !session.isRevoked) await sessionRepository.revoke(session.id); },
  refreshCookieMaxAgeMs(): number { return parseDuration(env.JWT_REFRESH_EXPIRES_IN); },
};
