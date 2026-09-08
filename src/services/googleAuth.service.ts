import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { userRepository } from "../repositories/user.repository";
import { deviceService } from "./device.service";
import { tokenService } from "./token.service";
import { auditService } from "./audit.service";

interface GoogleIdentity { sub: string; email: string; name?: string; picture?: string; email_verified?: string; }
function usernameBase(email: string, name?: string) { const value = (name || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24); return value || "maxuser"; }
async function uniqueUsername(base: string) { let candidate = base; for (let i = 0; i < 100; i += 1) { if (!(await userRepository.findByUsername(candidate))) return candidate; candidate = `${base.slice(0, 20)}${i + 1}`; } return `max${Date.now().toString(36)}`.slice(0, 32); }

async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError("Google Sign-In is not configured", 503, "GOOGLE_NOT_CONFIGURED");
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw AppError.unauthorized("Invalid Google credential", "INVALID_GOOGLE_CREDENTIAL");
  const data = (await response.json()) as GoogleIdentity & { aud?: string; exp?: string };
  if (data.aud !== env.GOOGLE_CLIENT_ID) throw AppError.unauthorized("Google credential was issued for another application", "INVALID_GOOGLE_AUDIENCE");
  if (!data.sub || !data.email || data.email_verified !== "true") throw AppError.unauthorized("A verified Google account is required", "GOOGLE_EMAIL_NOT_VERIFIED");
  if (data.exp && Number(data.exp) * 1000 < Date.now()) throw AppError.unauthorized("Google credential has expired", "INVALID_GOOGLE_CREDENTIAL");
  return data;
}

export const googleAuthService = {
  async signIn(credential: string, ctx: { ipAddress?: string; userAgent?: string; clientHint?: string }) {
    const identity = await verifyGoogleCredential(credential);
    const email = identity.email.toLowerCase();
    let user = await userRepository.findByEmail(email);
    if (!user) {
      const username = await uniqueUsername(usernameBase(email, identity.name));
      user = await prisma.user.create({ data: { username, email, passwordHash: "GOOGLE_AUTH_ONLY", displayName: identity.name || username, avatarUrl: identity.picture, verificationStatus: "VERIFIED", aiProfile: { create: {} } } });
      await auditService.record("REGISTER", { userId: user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider: "GOOGLE" } });
    } else {
      if (user.status !== "ACTIVE") throw AppError.forbidden("This account is not active", "ACCOUNT_NOT_ACTIVE");
      await userRepository.update(user.id, { avatarUrl: identity.picture || user.avatarUrl, displayName: identity.name || user.displayName, verificationStatus: "VERIFIED" });
      user = (await userRepository.findById(user.id))!;
    }
    const existingConnection = await prisma.connectedAccount.findUnique({ where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.sub } } });
    if (existingConnection && existingConnection.userId !== user.id) throw AppError.conflict("This Google account is already linked to another MAX Account", "GOOGLE_ACCOUNT_ALREADY_LINKED");
    if (!existingConnection) await prisma.connectedAccount.create({ data: { userId: user.id, provider: "GOOGLE", providerAccountId: identity.sub, scope: "openid email profile" } });
    const device = await deviceService.identifyOrCreateDevice(user.id, ctx, ctx.clientHint);
    const tokens = await tokenService.issueTokenPair(user, { deviceId: device.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    await auditService.record("LOGIN_SUCCESS", { userId: user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider: "GOOGLE" } });
    return { user, ...tokens };
  },
};
