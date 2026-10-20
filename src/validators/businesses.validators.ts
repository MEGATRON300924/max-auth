import { z } from "zod";
export const createBusinessSchema = z.object({ body: z.object({ legalName: z.string().min(2).max(160), displayName: z.string().min(2).max(120), handle: z.string().min(3).max(48), businessType: z.string().min(2).max(64), country: z.string().length(2), businessEmail: z.string().email().max(255) }) });
export const updateBusinessSchema = z.object({ params: z.object({ businessId: z.string().min(1) }), body: z.object({ displayName: z.string().min(2).max(120).optional() }) });
export const businessIdParamSchema = z.object({ params: z.object({ businessId: z.string().min(1) }) });
