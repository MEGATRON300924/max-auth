import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/),
    fullName: z.string().trim().min(1).max(128),
    displayName: z.string().trim().min(1).max(64),
    ageConfirmed: z.literal(true),
    ageGroup: z.enum(["UNDER_16", "AGE_16_17", "AGE_18_PLUS"]),
    parentEmail: z.string().trim().email().max(255).optional(),
    email: z.string().email().max(255),
    password: passwordSchema,
    country: z.string().length(2).optional(),
    language: z.string().max(10).optional(),
    timezone: z.string().max(64).optional(),
    rememberMe: z.boolean().optional().default(true),
  }).superRefine((body, ctx) => {
    if (body.ageGroup !== "AGE_18_PLUS" && !body.parentEmail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["parentEmail"], message: "A parent or guardian email is required for accounts under 18." });
    }
    if (body.parentEmail && body.parentEmail.toLowerCase() === body.email.toLowerCase()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["parentEmail"], message: "Use a parent or guardian email address, not your own." });
    }
  }),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(3, "Email or username is required"),
    password: z.string().min(1, "Password is required"),
    rememberMe: z.boolean().optional().default(true),
    mfaCode: z.string().min(6).max(32).optional(),
  }),
});

export const refreshSchema = z.object({ body: z.object({ refreshToken: z.string().optional() }).optional() });
export const forgotPasswordSchema = z.object({ body: z.object({ email: z.string().email() }) });
export const resetPasswordSchema = z.object({ body: z.object({ token: z.string().min(10), newPassword: passwordSchema }) });
export const changePasswordSchema = z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }) });
export const verifyEmailSchema = z.object({ body: z.object({ token: z.string().min(10) }) });
export const deleteAccountSchema = z.object({ body: z.object({ password: z.string().min(1) }) });
