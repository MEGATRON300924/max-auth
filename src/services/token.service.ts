import { randomUUID } from "crypto";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../security/jwt";
import { hashToken } from "../security/tokens";
import { sessionRepository } from "../repositories/session.repository";
import { userRepository } from "../repositories/user.repository";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { User } from "@prisma/client";

function refreshExpiryDate(): Date {
  return new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN));
}

// tiny local duration parser (avoids extra dependency issues with the `ms` package's types)
function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30d
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return num * unitMs;
}

export const tokenService = {
  /**
   * Issues a new access + refresh token pair and persists the session record
   * in a single atomic insert.
   *
   * The session ID is generated client-side (crypto.randomUUID()) BEFORE the
   * DB write so it can be embedded in both JWTs and the refresh token's hash
   * can be computed and stored in the same `create` call. This avoids a
   * two-phase "insert placeholder, then update with real hash" pattern,
   * which would otherwise risk a unique-constraint collision on
   * `refreshTokenHash` if two sessions were created in the same instant.
   */
  async issueTokenPair(
    user: Pick<User, "id" | "username" | "subscriptionTier">,
    ctx: { deviceId?: string; ipAddress?: string; userAgent?: string }
  ) {
    const sessionId = randomUUID();

    const accessToken = signAccessToken({
      sub: user.id,
      username: user.username,
      tier: user.subscriptionTier,
      sessionId,
    });

    const refreshToken = signRefreshToken({
      sub: user.id,
      sessionId,
    });

    await sessionRepository.create({
      id: sessionId,
      user: { connect: { id: user.id } },
      device: ctx.deviceId ? { connect: { id: ctx.deviceId } } : undefined,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
      expiresAt: refreshExpiryDate(),
    });

    return { accessToken, refreshToken, sessionId };
  },

  /**
   * Verifies a refresh token (signature + DB session state) and rotates it,
   * issuing a brand-new access/refresh pair while revoking the old session.
   * Refresh token rotation prevents replay of stolen refresh tokens.
   */
  async rotateRefreshToken(
    rawRefreshToken: string,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await sessionRepository.findByRefreshTokenHash(tokenHash);

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw AppError.unauthorized("Session is no longer valid");
    }

    if (session.userId !== payload.sub || session.id !== payload.sessionId) {
      throw AppError.unauthorized("Token/session mismatch");
    }

    // Revoke old session (rotation) and issue a new pair.
    await sessionRepository.revoke(session.id);

    const user = await userRepository.findById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      throw AppError.unauthorized("Account is not active");
    }

    return this.issueTokenPair(user, {
      deviceId: session.deviceId ?? undefined,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  async revokeByRawRefreshToken(rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);
    const session = await sessionRepository.findByRefreshTokenHash(tokenHash);
    if (session && !session.isRevoked) {
      await sessionRepository.revoke(session.id);
    }
  },

  refreshCookieMaxAgeMs(): number {
    return parseDuration(env.JWT_REFRESH_EXPIRES_IN);
  },
};
