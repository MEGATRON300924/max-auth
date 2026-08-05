import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { userRepository } from "../repositories/user.repository";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";

export const userService = {
  async getProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound("User not found");
    return user;
  },

  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      avatarUrl?: string;
      country?: string;
      language?: string;
      timezone?: string;
    },
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const user = await userRepository.update(userId, data);

    await auditService.record("PROFILE_UPDATED", {
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: data,
    });

    return user;
  },

  async getAIProfile(userId: string) {
    let profile = await prisma.aIProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await prisma.aIProfile.create({
        data: { userId },
      });
    }

    return profile;
  },

  async updateAIProfile(
    userId: string,
    data: {
      interests?: string[];
      preferences?: Record<string, unknown>;
      languages?: string[];
      connectedServices?: string[];
    }
  ) {
    return prisma.aIProfile.upsert({
      where: { userId },

      create: {
        userId,
        interests: data.interests as Prisma.InputJsonValue | undefined,
        preferences: data.preferences as Prisma.InputJsonValue | undefined,
        languages: data.languages as Prisma.InputJsonValue | undefined,
        connectedServices:
          data.connectedServices as Prisma.InputJsonValue | undefined,
      },

      update: {
        interests: data.interests as Prisma.InputJsonValue | undefined,
        preferences: data.preferences as Prisma.InputJsonValue | undefined,
        languages: data.languages as Prisma.InputJsonValue | undefined,
        connectedServices:
          data.connectedServices as Prisma.InputJsonValue | undefined,
      },
    });
  },
};
