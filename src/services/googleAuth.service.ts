import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { userRepository } from "../repositories/user.repository";
import { hashPassword } from "../security/password";
import { generateOpaqueToken } from "../security/tokens";
import { deviceService } from "./device.service";
import { tokenService } from "./token.service";
import { auditService } from "./audit.service";
import { mfaService } from "./mfa.service";
import { ConnectedProvider } from "@prisma/client";

interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: string | boolean;
}

function usernameBase(email: string, name?: string) {
  const value = (name || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  return value || "maxuser";
}

async function uniqueUsername(base: string) {
  let candidate = base;
  for (let i = 0; i < 100; i += 1) {
    if (!(await userRepository.findByUsername(candidate))) return candidate;
    candidate = `${base.slice(0, 20)}${i + 1}`;
  }
  return `max${Date.now().toString(36)}`.slice(0, 32);
}

type GoogleJwk = {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
};

let googleKeysCache: { keys: GoogleJwk[]; expiresAt: number } | null = null;

async function googleSigningKeys(): Promise<GoogleJwk[]> {
  if (googleKeysCache && googleKeysCache.expiresAt > Date.now()) return googleKeysCache.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new AppError("Google identity verification is temporarily unavailable", 503, "GOOGLE_VERIFICATION_UNAVAILABLE");
  const body = (await response.json()) as { keys: GoogleJwk[] };
  const cacheControl = response.headers.get("cache-control") || "";
  const match = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = Number(match?.[1] || 3600);
  googleKeysCache = {
    keys: body.keys,
    expiresAt: Date.now() + Math.min(Math.max(maxAge, 300), 24 * 60 * 60) * 1000,
  };
  return body.keys;
}

async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError("Google Sign-In is not configured", 503, "GOOGLE_NOT_CONFIGURED");
  try {
    const decoded = jwt.decode(credential, { complete: true }) as { header?: { kid?: string; alg?: string } } | null;
    const kid = decoded?.header?.kid;
    if (!kid || decoded?.header?.alg !== "RS256") throw new Error("invalid header");

    let keys = await googleSigningKeys();
    let jwk = keys.find((key) => key.kid === kid);
    if (!jwk) {
      googleKeysCache = null;
      keys = await googleSigningKeys();
      jwk = keys.find((key) => key.kid === kid);
    }
    if (!jwk) throw new Error("unknown signing key");

    const publicKey = crypto.createPublicKey({ key: jwk as any, format: "jwk" });
    const payload = jwt.verify(credential, publicKey, {
      algorithms: ["RS256"],
      audience: env.GOOGLE_CLIENT_ID,
      issuer: ["accounts.google.com", "https://accounts.google.com"],
    }) as GoogleIdentity & { exp?: number };

    if (!payload.sub || !payload.email || payload.email_verified !== true && payload.email_verified !== "true") {
      throw new Error("unverified identity");
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized("Invalid Google credential", "INVALID_GOOGLE_CREDENTIAL");
  }
}

export const googleAuthService = {
  async connect(userId: string, credential: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const identity = await verifyGoogleCredential(credential);
    const existing = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: ConnectedProvider.GOOGLE, providerAccountId: identity.sub } },
    });

    if (existing && existing.userId !== userId) {
      throw AppError.conflict("This Google account is already linked to another MAX Account", "GOOGLE_ACCOUNT_ALREADY_LINKED");
    }

    if (!existing) {
      await prisma.connectedAccount.create({
        data: {
          userId,
          provider: ConnectedProvider.GOOGLE,
          providerAccountId: identity.sub,
          scope: "openid email profile",
        },
      });
      await auditService.record("CONNECTED_ACCOUNT_LINKED", {
        userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { provider: ConnectedProvider.GOOGLE },
      });
    }

    return { provider: "GOOGLE" as const };
  },

  async signIn(credential: string, ctx: { ipAddress?: string; userAgent?: string; clientHint?: string }, mfaCode?: string) {
    const identity = await verifyGoogleCredential(credential);
    const email = identity.email.toLowerCase();

    const linked = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.sub } },
    });

    let user = linked ? await userRepository.findById(linked.userId) : await userRepository.findByEmail(email);

    // Never silently merge a Google identity into an existing MAX Account
    // merely because the email address matches. The user must first sign in
    // to that MAX Account and explicitly connect Google.
    if (!linked && user) {
      throw AppError.conflict(
        "A MAX Account already uses this email. Sign in to that account first, then connect Google from Connected Apps.",
        "GOOGLE_ACCOUNT_LINK_REQUIRED",
      );
    }

    if (!user) {
      const username = await uniqueUsername(usernameBase(email, identity.name));
      user = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash: await hashPassword(generateOpaqueToken(32)),
          displayName: identity.name || username,
          avatarUrl: identity.picture,
          verificationStatus: "VERIFIED",
          aiProfile: { create: {} },
        },
      });
      await auditService.record("REGISTER", {
        userId: user.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { provider: "GOOGLE" },
      });
    } else {
      if (user.status !== "ACTIVE") {
        throw AppError.forbidden("This account is not active", "ACCOUNT_NOT_ACTIVE");
      }
      await userRepository.update(user.id, {
        avatarUrl: identity.picture || user.avatarUrl,
        displayName: identity.name || user.displayName,
        verificationStatus: "VERIFIED",
      });
      user = (await userRepository.findById(user.id))!;
    }

    const existingConnection = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.sub } },
    });

    if (existingConnection && existingConnection.userId !== user.id) {
      throw AppError.conflict("This Google account is already linked to another MAX Account", "GOOGLE_ACCOUNT_ALREADY_LINKED");
    }

    if (!existingConnection) {
      await prisma.connectedAccount.create({
        data: {
          userId: user.id,
          provider: "GOOGLE",
          providerAccountId: identity.sub,
          scope: "openid email profile",
        },
      });
      await auditService.record("CONNECTED_ACCOUNT_LINKED", {
        userId: user.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { provider: "GOOGLE", reason: "sign_in" },
      });
    }

    await mfaService.verifyLoginFactor(user.id, mfaCode);
    const device = await deviceService.identifyOrCreateDevice(user.id, ctx, ctx.clientHint);
    const tokens = await tokenService.issueTokenPair(user, {
      deviceId: device.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await auditService.record("LOGIN_SUCCESS", {
      userId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { provider: "GOOGLE" },
    });

    return { user, ...tokens };
  },
};
