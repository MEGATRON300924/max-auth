import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // userId
  username: string;
  tier: string;
  sessionId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string; // userId
  sessionId: string;
  type: "refresh";
}

const signOptionsBase = {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

const verifyOptionsBase: VerifyOptions = {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

export function signAccessToken(
  payload: Omit<AccessTokenPayload, "type">
): string {
  return jwt.sign({ ...payload, type: "access" }, env.JWT_ACCESS_SECRET, {
    ...signOptionsBase,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, "type">
): string {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    ...signOptionsBase,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, verifyOptionsBase);
  if (typeof decoded === "string") {
    throw new Error("Invalid access token");
  }
  const payload = decoded as unknown as AccessTokenPayload;
  if (payload.type !== "access") {
    throw new Error("Invalid access token");
  }
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, verifyOptionsBase);
  if (typeof decoded === "string") {
    throw new Error("Invalid refresh token");
  }
  const payload = decoded as unknown as RefreshTokenPayload;
  if (payload.type !== "refresh") {
    throw new Error("Invalid refresh token");
  }
  return payload;
}

/** Decode without verifying — only for reading expired token metadata during logout, etc. */
export function decodeToken(token: string) {
  return jwt.decode(token);
}
