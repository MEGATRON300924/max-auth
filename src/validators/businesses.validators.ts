import { z } from "zod";

const handleSchema = z.string().trim().min(3).max(48).transform((value) => value.toLowerCase()).refine(
  (value) => value.split("").every((character) => "abcdefghijklmnopqrstuvwxyz0123456789-".includes(character)) && !value.startsWith("-") && !value.endsWith("-") && !value.includes("--"),
  "Use lowercase letters, numbers, and single hyphens only.",
);
const businessIdSchema = z.string().length(23).refine(
  (value) => value.startsWith("maxbiz_") && value.slice(7).split("").every((character) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".includes(character)),
  "Invalid business ID.",
);

export const createBusinessSchema = z.object({
  body: z.object({
    legalName: z.string().trim().min(2).max(160),
    displayName: z.string().trim().min(2).max(120),
    handle: handleSchema,
    businessType: z.string().trim().min(2).max(64),
    country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
    businessEmail: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(5).max(32).optional(),
    website: z.string().trim().url().max(2048).optional(),
    description: z.string().trim().max(1000).optional(),
  }).strict(),
});

export const updateBusinessSchema = z.object({
  params: z.object({ businessId: businessIdSchema }),
  body: z.object({
    legalName: z.string().trim().min(2).max(160).optional(),
    displayName: z.string().trim().min(2).max(120).optional(),
    businessType: z.string().trim().min(2).max(64).optional(),
    businessEmail: z.string().trim().email().max(255).transform((value) => value.toLowerCase()).optional(),
    phone: z.string().trim().min(5).max(32).nullable().optional(),
    website: z.string().trim().url().max(2048).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, "Provide at least one field to update."),
});

export const businessIdParamSchema = z.object({ params: z.object({ businessId: businessIdSchema }) });
