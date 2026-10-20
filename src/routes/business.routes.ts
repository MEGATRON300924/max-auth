import { Router } from "express";
import { z } from "zod";
import { BusinessMemberRole } from "@prisma/client";
import { businessController } from "../controllers/business.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiter";

const router = Router();
const createSchema = z.object({ body: z.object({
  legalName: z.string().trim().min(2).max(180),
  displayName: z.string().trim().min(2).max(120),
  handle: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/).optional(),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(40),
  country: z.string().trim().length(2),
  businessType: z.string().trim().min(2).max(80),
  websiteUrl: z.string().url().max(2048).optional(),
  description: z.string().trim().max(2000).optional(),
  registrationNumber: z.string().trim().max(120).optional(),
}) });
const updateSchema = z.object({ body: z.object({
  legalName: z.string().trim().min(2).max(180).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(7).max(40).optional(),
  country: z.string().trim().length(2).optional(),
  businessType: z.string().trim().min(2).max(80).optional(),
  websiteUrl: z.string().url().max(2048).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  registrationNumber: z.string().trim().max(120).nullable().optional(),
}).refine((body) => Object.keys(body).length > 0, "At least one business field is required") });
const verifySchema = z.object({ body: z.object({ token: z.string().min(32).max(256) }) });
const inviteSchema = z.object({ body: z.object({ email: z.string().trim().email().max(254), role: z.nativeEnum(BusinessMemberRole).refine((role) => role !== BusinessMemberRole.OWNER, "Ownership must be transferred separately") }) });
const acceptInvitationSchema = z.object({ body: z.object({ token: z.string().min(32).max(256) }) });
const memberRoleSchema = z.object({ body: z.object({ role: z.nativeEnum(BusinessMemberRole) }) });
const transferSchema = z.object({ body: z.object({ membershipId: z.string().uuid() }) });

// Email verification is token-based and can be completed before signing in.
router.post("/:businessId/verify-email", sensitiveActionRateLimiter, validate(verifySchema), businessController.verifyEmail);

router.use(authenticate);
router.get("/", businessController.list);
router.post("/", sensitiveActionRateLimiter, validate(createSchema), businessController.create);
router.post("/invitations/accept", sensitiveActionRateLimiter, validate(acceptInvitationSchema), businessController.acceptInvitation);
router.get("/:businessId", businessController.get);
router.patch("/:businessId", validate(updateSchema), businessController.update);
router.get("/:businessId/members", businessController.members);
router.post("/:businessId/invitations", sensitiveActionRateLimiter, validate(inviteSchema), businessController.invite);
router.delete("/:businessId/invitations/:invitationId", businessController.revokeInvitation);
router.patch("/:businessId/members/:membershipId", validate(memberRoleSchema), businessController.updateMember);
router.delete("/:businessId/members/:membershipId", businessController.removeMember);
router.post("/:businessId/transfer-ownership", sensitiveActionRateLimiter, validate(transferSchema), businessController.transferOwnership);
router.get("/:businessId/apps", businessController.apps);
router.delete("/:businessId/apps/:connectionId", businessController.revokeApp);
router.get("/:businessId/audit-logs", businessController.auditLogs);

export default router;
