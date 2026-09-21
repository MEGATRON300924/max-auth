import crypto from "crypto";
import { prisma } from "../database/prisma";
import { verifyPassword } from "../security/password";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { auditService } from "./audit.service";
import { AppError } from "../utils/AppError";

const ISSUER = "MAX Account";
const RECOVERY_CODE_COUNT = 10;
const TOTP_STEP_SECONDS = 30;

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(process.env.JWT_REFRESH_SECRET || "max-auth-mfa").digest();
}

function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Invalid encrypted MFA secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const decoded = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const expected = hotp(decoded, counter + offset);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

function randomSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let buffer = 0;
  let output = "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function recoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = generateOpaqueToken(9).replace(/[-_]/g, "").slice(0, 12).toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

function normalizeRecoveryCode(code: string) {
  return code.replace(/[-\s]/g, "").toUpperCase();
}

async function generateAndStoreRecoveryCodes(userId: string) {
  const codes = recoveryCodes();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    ...codes.map((code) => prisma.recoveryCode.create({ data: { userId, codeHash: hashToken(normalizeRecoveryCode(code)) } })),
  ]);
  return codes;
}

export const mfaService = {
  async status(userId: string) {
    const record = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    const remainingRecoveryCodes = await prisma.recoveryCode.count({ where: { userId, usedAt: null } });
    return { enabled: record?.isEnabled === true, method: record?.isEnabled ? record.method || "TOTP" : null, recoveryCodesRemaining: remainingRecoveryCodes };
  },

  async beginSetup(userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound("User not found");
    if (!(await verifyPassword(user.passwordHash, password))) throw AppError.unauthorized("Password is incorrect", "INVALID_PASSWORD");
    const existing = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (existing?.isEnabled) throw AppError.conflict("MFA is already enabled", "MFA_ALREADY_ENABLED");
    const secret = randomSecret();
    await prisma.twoFactorAuth.upsert({
      where: { userId },
      create: { userId, method: "TOTP", secretEncrypted: encryptSecret(secret), isEnabled: false },
      update: { method: "TOTP", secretEncrypted: encryptSecret(secret), isEnabled: false, verifiedAt: null },
    });
    const label = encodeURIComponent(user.email);
    const issuer = encodeURIComponent(ISSUER);
    return { secret, otpauthUrl: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
  },

  async enable(userId: string, password: string, code: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const record = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (!user || !record?.secretEncrypted) throw AppError.badRequest("Start MFA setup first", "MFA_SETUP_REQUIRED");
    if (!(await verifyPassword(user.passwordHash, password))) throw AppError.unauthorized("Password is incorrect", "INVALID_PASSWORD");
    if (!verifyTotp(decryptSecret(record.secretEncrypted), code)) throw AppError.unauthorized("Invalid authenticator code", "INVALID_MFA_CODE");
    const codes = await generateAndStoreRecoveryCodes(userId);
    await prisma.twoFactorAuth.update({ where: { userId }, data: { isEnabled: true, verifiedAt: new Date(), method: "TOTP" } });
    await auditService.record("TWO_FA_ENABLED", { userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    await auditService.record("RECOVERY_CODES_GENERATED", { userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { recoveryCodes: codes };
  },

  async verifyLoginFactor(userId: string, code?: string) {
    const record = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (!record?.isEnabled || !record.secretEncrypted) return;
    if (!code) throw AppError.unauthorized("Multi-factor authentication is required", "MFA_REQUIRED");
    if (/^\d{6}$/.test(code)) {
      if (verifyTotp(decryptSecret(record.secretEncrypted), code)) return;
    } else {
      const normalized = normalizeRecoveryCode(code);
      const matches = await prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
      const match = matches.find((item) => crypto.timingSafeEqual(Buffer.from(item.codeHash), Buffer.from(hashToken(normalized))));
      if (match) {
        await prisma.recoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
        return;
      }
    }
    throw AppError.unauthorized("Invalid multi-factor authentication code", "INVALID_MFA_CODE");
  },

  async regenerateRecoveryCodes(userId: string, password: string, code: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const record = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (!user || !record?.isEnabled || !record.secretEncrypted) throw AppError.badRequest("MFA is not enabled", "MFA_NOT_ENABLED");
    if (!(await verifyPassword(user.passwordHash, password))) throw AppError.unauthorized("Password is incorrect", "INVALID_PASSWORD");
    if (!verifyTotp(decryptSecret(record.secretEncrypted), code)) throw AppError.unauthorized("Invalid authenticator code", "INVALID_MFA_CODE");
    const codes = await generateAndStoreRecoveryCodes(userId);
    await auditService.record("RECOVERY_CODES_GENERATED", { userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { recoveryCodes: codes };
  },

  async disable(userId: string, password: string, code: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const record = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (!user || !record?.isEnabled || !record.secretEncrypted) throw AppError.badRequest("MFA is not enabled", "MFA_NOT_ENABLED");
    if (!(await verifyPassword(user.passwordHash, password))) throw AppError.unauthorized("Password is incorrect", "INVALID_PASSWORD");
    let valid = verifyTotp(decryptSecret(record.secretEncrypted), code);
    if (!valid) {
      const normalized = normalizeRecoveryCode(code);
      const matches = await prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
      const match = matches.find((item) => crypto.timingSafeEqual(Buffer.from(item.codeHash), Buffer.from(hashToken(normalized))));
      if (match) {
        await prisma.recoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
        valid = true;
      }
    }
    if (!valid) throw AppError.unauthorized("Invalid multi-factor authentication code", "INVALID_MFA_CODE");
    await prisma.$transaction([
      prisma.twoFactorAuth.update({ where: { userId }, data: { isEnabled: false, verifiedAt: null } }),
      prisma.recoveryCode.deleteMany({ where: { userId } }),
      prisma.oAuthAccessToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.oAuthRefreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await auditService.record("TWO_FA_DISABLED", { userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { disabled: true };
  },
};
