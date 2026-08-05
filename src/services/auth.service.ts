import { prisma } from "../database/prisma";
import { userRepository } from "../repositories/user.repository";
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "../security/password";
import { generateOpaqueToken, hashToken } from "../security/tokens";
import { tokenService } from "./token.service";
import { deviceService } from "./device.service";
import { auditService } from "./audit.service";
import { mailService } from "./mail.service";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { logger } from "../utils/logger";

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  clientHint?: string;
}

const PASSWORD_HISTORY_LIMIT = 5;

export const authService = {
  async register(
    input: {
      username: string;
      email: string;
      password: string;
      displayName?: string;
      country?: string;
      language?: string;
      timezone?: string;
    },
    ctx: RequestContext
  ) {
    const email = input.email.toLowerCase();

    const [existingEmail, existingUsername] = await Promise.all([
      userRepository.findByEmail(email),
      userRepository.findByUsername(input.username),
    ]);

    if (existingEmail) {
      throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
    }
    if (existingUsername) {
      throw AppError.conflict("This username is already taken", "USERNAME_TAKEN");
    }
    if (!isPasswordStrongEnough(input.password)) {
      throw AppError.badRequest("Password does not meet strength requirements", "WEAK_PASSWORD");
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        username: input.username,
        email,
        passwordHash,
        displayName: input.displayName ?? input.username,
        country: input.country,
        language: input.language,
        timezone: input.timezone,
        aiProfile: { create: {} },
      },
    });

    await prisma.passwordHistory.create({
      data: { userId: user.id, passwordHash },
    });

    await auditService.record("REGISTER", {
      userId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Fire off email verification immediately.
    await this.sendEmailVerification(user.id, ctx);

    const device = await deviceService.identifyOrCreateDevice(user.id, ctx, ctx.clientHint);
    const tokens = await tokenService.issueTokenPair(user, {
      deviceId: device.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { user, ...tokens };
  },

  async login(identifier: string, password: string, ctx: RequestContext) {
    const user = await userRepository.findByIdentifier(identifier);

    if (!user) {
      // Constant-time-ish: still do a dummy hash compare to reduce user enumeration timing signal.
      await verifyPassword(
        "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$invalidinvalidinvalidinvalid",
        password
      ).catch(() => undefined);
      throw AppError.unauthorized("Invalid email/username or password", "INVALID_CREDENTIALS");
    }

    if (user.status !== "ACTIVE") {
      await auditService.recordLogin({
        userId: user.id,
        success: false,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        reason: `account_${user.status.toLowerCase()}`,
      });
      throw AppError.forbidden("This account is not active", "ACCOUNT_NOT_ACTIVE");
    }

    const validPassword = await verifyPassword(user.passwordHash, password);

    if (!validPassword) {
      await auditService.recordLogin({
        userId: user.id,
        success: false,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        reason: "invalid_password",
      });
      await auditService.record("LOGIN_FAILED", {
        userId: user.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      throw AppError.unauthorized("Invalid email/username or password", "INVALID_CREDENTIALS");
    }

    const device = await deviceService.identifyOrCreateDevice(user.id, ctx, ctx.clientHint);
    const tokens = await tokenService.issueTokenPair(user, {
      deviceId: device.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await auditService.recordLogin({
      userId: user.id,
      success: true,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    await auditService.record("LOGIN_SUCCESS", {
      userId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { user, ...tokens };
  },

  async logout(rawRefreshToken: string | undefined, userId?: string, ctx?: RequestContext) {
    if (rawRefreshToken) {
      await tokenService.revokeByRawRefreshToken(rawRefreshToken);
    }
    if (userId) {
      await auditService.record("LOGOUT", {
        userId,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      });
    }
  },

  async refresh(rawRefreshToken: string, ctx: RequestContext) {
    const tokens = await tokenService.rotateRefreshToken(rawRefreshToken, ctx);
    await auditService.record("TOKEN_REFRESH", {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return tokens;
  },

  // ---------------- Email verification ----------------

  async sendEmailVerification(userId: string, ctx: RequestContext) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found");
    if (user.verificationStatus === "VERIFIED") {
      throw AppError.badRequest("Email is already verified", "ALREADY_VERIFIED");
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000
    );

    await prisma.verificationToken.create({
      data: {
        userId,
        tokenHash,
        purpose: "EMAIL_VERIFICATION",
        expiresAt,
      },
    });

    await userRepository.update(userId, { verificationStatus: "PENDING" });

    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;
    await mailService.send({
      to: user.email,
      subject: "Verify your MAX Account",
      text: `Welcome to MAX! Verify your email: ${verifyUrl}`,
    });

    await auditService.record("EMAIL_VERIFICATION_SENT", {
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    logger.info(`Email verification sent to user ${userId}`);
  },

  async verifyEmail(rawToken: string, ctx: RequestContext) {
    const tokenHash = hashToken(rawToken);
    const record = await prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (
      !record ||
      record.purpose !== "EMAIL_VERIFICATION" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw AppError.badRequest("Invalid or expired verification token", "INVALID_TOKEN");
    }

    await prisma.$transaction([
      prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { verificationStatus: "VERIFIED" },
      }),
    ]);

    await auditService.record("EMAIL_VERIFIED", {
      userId: record.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  // ---------------- Forgot / Reset password ----------------

  async forgotPassword(email: string, ctx: RequestContext) {
    const user = await userRepository.findByEmail(email);

    // Always respond as if successful to avoid user enumeration — caller controls response text.
    if (!user) return;

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
    );

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: "PASSWORD_RESET",
        expiresAt,
      },
    });

    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    await mailService.send({
      to: user.email,
      subject: "Reset your MAX Account password",
      text: `Reset your password: ${resetUrl} (expires in ${env.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes)`,
    });

    await auditService.record("PASSWORD_RESET_REQUESTED", {
      userId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  async resetPassword(rawToken: string, newPassword: string, ctx: RequestContext) {
    const tokenHash = hashToken(rawToken);
    const record = await prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (
      !record ||
      record.purpose !== "PASSWORD_RESET" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw AppError.badRequest("Invalid or expired reset token", "INVALID_TOKEN");
    }

    if (!isPasswordStrongEnough(newPassword)) {
      throw AppError.badRequest("Password does not meet strength requirements", "WEAK_PASSWORD");
    }

    await this.assertNotInPasswordHistory(record.userId, newPassword);

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordHistory.create({
        data: { userId: record.userId, passwordHash },
      }),
    ]);

    // Reset password = revoke all existing sessions for safety.
    await deviceService.revokeAllSessions(record.userId);

    await auditService.record("PASSWORD_RESET_COMPLETED", {
      userId: record.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext
  ) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) throw AppError.unauthorized("Current password is incorrect", "INVALID_PASSWORD");

    if (!isPasswordStrongEnough(newPassword)) {
      throw AppError.badRequest("Password does not meet strength requirements", "WEAK_PASSWORD");
    }

    await this.assertNotInPasswordHistory(userId, newPassword);

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.passwordHistory.create({ data: { userId, passwordHash } }),
    ]);

    await auditService.record("PASSWORD_CHANGED", {
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  async assertNotInPasswordHistory(userId: string, newPassword: string) {
    const history = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PASSWORD_HISTORY_LIMIT,
    });

    for (const record of history) {
      const reused = await verifyPassword(record.passwordHash, newPassword);
      if (reused) {
        throw AppError.badRequest(
          `You cannot reuse any of your last ${PASSWORD_HISTORY_LIMIT} passwords`,
          "PASSWORD_REUSED"
        );
      }
    }
  },

  // ---------------- Delete account ----------------

  async deleteAccount(userId: string, password: string, ctx: RequestContext) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) throw AppError.unauthorized("Password is incorrect", "INVALID_PASSWORD");

    await deviceService.revokeAllSessions(userId);
    await userRepository.softDelete(userId);

    await auditService.record("ACCOUNT_DELETED", {
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },
};
