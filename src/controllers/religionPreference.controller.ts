import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { ok } from "../utils/response";

const neutralReligion = "prefer_not_to_say";

export const religionPreferenceController = {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const preference = await prisma.religionPreference.findUnique({
        where: { userId: req.user!.sub },
        select: {
          religion: true,
          tradition: true,
          otherReligion: true,
          onboardingStatus: true,
          personalizationEnabled: true,
          notificationPreferences: true,
          promptDeferredUntil: true,
          promptCompletedAt: true,
          notificationPromptCompletedAt: true,
          updatedAt: true,
        },
      });
      return ok(res, {
        preference: preference ?? {
          religion: null,
          tradition: null,
          otherReligion: null,
          onboardingStatus: "PENDING",
          personalizationEnabled: false,
          notificationPreferences: {},
          promptDeferredUntil: null,
          promptCompletedAt: null,
          notificationPromptCompletedAt: null,
          updatedAt: null,
        },
      });
    } catch (error) {
      return next(error);
    }
  },

  async save(req: Request, res: Response, next: NextFunction) {
    try {
      const religion = String(req.body.religion).trim();
      const neutral = religion === neutralReligion;
      const notificationPreferences = neutral
        ? {}
        : (req.body.notificationPreferences ?? {});
      const preference = await prisma.religionPreference.upsert({
        where: { userId: req.user!.sub },
        create: {
          userId: req.user!.sub,
          religion,
          tradition: req.body.tradition?.trim() || null,
          otherReligion: religion === "other" ? req.body.otherReligion?.trim() || null : null,
          onboardingStatus: "COMPLETED",
          personalizationEnabled: !neutral,
          notificationPreferences: notificationPreferences as Prisma.InputJsonValue,
          promptDeferredUntil: null,
          promptCompletedAt: new Date(),
          notificationPromptCompletedAt: null,
        },
        update: {
          religion,
          tradition: req.body.tradition?.trim() || null,
          otherReligion: religion === "other" ? req.body.otherReligion?.trim() || null : null,
          onboardingStatus: "COMPLETED",
          personalizationEnabled: !neutral,
          notificationPreferences: notificationPreferences as Prisma.InputJsonValue,
          promptDeferredUntil: null,
          promptCompletedAt: new Date(),
          notificationPromptCompletedAt: null,
        },
        select: {
          religion: true,
          tradition: true,
          otherReligion: true,
          onboardingStatus: true,
          personalizationEnabled: true,
          notificationPreferences: true,
          promptDeferredUntil: true,
          promptCompletedAt: true,
          notificationPromptCompletedAt: true,
          updatedAt: true,
        },
      });
      return ok(res, { preference });
    } catch (error) {
      return next(error);
    }
  },

  async saveNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const preference = await prisma.religionPreference.update({
        where: { userId: req.user!.sub },
        data: {
          notificationPreferences: req.body.notificationPreferences as Prisma.InputJsonValue,
          notificationPromptCompletedAt: new Date(),
        },
        select: { notificationPreferences: true, notificationPromptCompletedAt: true },
      });
      return ok(res, { preference });
    } catch (error) {
      return next(error);
    }
  },

  async completeNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const preference = await prisma.religionPreference.update({
        where: { userId: req.user!.sub },
        data: { notificationPromptCompletedAt: new Date() },
        select: { notificationPromptCompletedAt: true },
      });
      return ok(res, { preference });
    } catch (error) {
      return next(error);
    }
  },

  async defer(req: Request, res: Response, next: NextFunction) {
    try {
      const deferredUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const preference = await prisma.religionPreference.upsert({
        where: { userId: req.user!.sub },
        create: {
          userId: req.user!.sub,
          onboardingStatus: "DEFERRED",
          promptDeferredUntil: deferredUntil,
        },
        update: {
          onboardingStatus: "DEFERRED",
          promptDeferredUntil: deferredUntil,
        },
        select: { onboardingStatus: true, promptDeferredUntil: true },
      });
      return ok(res, { preference });
    } catch (error) {
      return next(error);
    }
  },

  async clear(req: Request, res: Response, next: NextFunction) {
    try {
      await prisma.religionPreference.deleteMany({ where: { userId: req.user!.sub } });
      return ok(res, { cleared: true, neutralMode: true });
    } catch (error) {
      return next(error);
    }
  },
};
