import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    displayName: z.string().max(64).optional(),
    avatarUrl: z.string().url().max(2048).optional(),
    country: z.string().length(2).optional(),
    language: z.string().max(10).optional(),
    timezone: z.string().max(64).optional(),
  }),
});

export const revokeDeviceSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid(),
  }),
});

export const revokeSessionSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid(),
  }),
});

export const updateAIProfileSchema = z.object({
  body: z.object({
    interests: z.array(z.string()).max(50).optional(),
    preferences: z.record(z.any()).optional(),
    languages: z.array(z.string()).max(10).optional(),
    connectedServices: z.array(z.string()).max(20).optional(),
  }),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});
