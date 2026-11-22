import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { adminController } from "../controllers/admin.controller";
import { authenticate } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";
import { spotlightReviewAccessController } from "../controllers/spotlightReviewAccess.controller";
import { betaController } from "../controllers/beta.controller";
import { diagnosticsController } from "../controllers/diagnostics.controller";
import { adminManagementController } from "../controllers/adminManagement.controller";
import { requireAdminPermission } from "../middleware/requireAdminPermission";

const router = Router();

router.use(authenticate, requireAdmin);
const canManageUsers = requireAdminPermission("user_management");
const canManageAdmins = requireAdminPermission("admin_management");
const canReviewOrganisations = requireAdminPermission("organisation_review");
const canManageBeta = requireAdminPermission("beta_management");
const canViewDiagnostics = requireAdminPermission("system_diagnostics");
const canManageSecurity = requireAdminPermission("security_management");
const canBroadcast = requireAdminPermission("broadcast_management");

router.get("/administrators", canManageAdmins, adminManagementController.listAdministrators);
router.post("/administrators", canManageAdmins, validate(z.object({ body: z.object({ username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/), role: z.string().trim().min(2).max(40).optional(), permissions: z.array(z.string()).max(7).optional(), fullAccess: z.boolean().optional() }) })), adminManagementController.grantAdministrator);
router.patch("/administrators/:userId", canManageAdmins, validate(z.object({ body: z.object({ role: z.string().trim().min(2).max(40).optional(), permissions: z.array(z.string()).max(7).optional(), fullAccess: z.boolean().optional(), revoke: z.boolean().optional() }) })), adminManagementController.updateAdministrator);
router.get("/broadcasts", canBroadcast, adminManagementController.listBroadcasts);
router.post("/broadcasts", canBroadcast, validate(z.object({ body: z.object({ title: z.string().trim().min(3).max(180), body: z.string().trim().min(1).max(12000), audience: z.enum(["ALL", "SELECTED"]), usernames: z.array(z.string().trim().min(3).max(32)).max(500).optional() }) })), adminManagementController.createBroadcast);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List/search users (paginated)
 */
router.get("/users", canManageUsers, adminController.listUsers);

/**
 * @openapi
 * /admin/users/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single user by ID
 */
router.get("/users/:userId", canManageUsers, adminController.getUser);

/**
 * @openapi
 * /admin/users/{userId}/suspend:
 *   post:
 *     tags: [Admin]
 *     summary: Suspend a user account
 */
router.post("/users/:userId/suspend", canManageUsers, adminController.suspendUser);

/**
 * @openapi
 * /admin/users/{userId}/reactivate:
 *   post:
 *     tags: [Admin]
 *     summary: Reactivate a suspended user account
 */
router.post("/users/:userId/reactivate", canManageUsers, adminController.reactivateUser);

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get platform-wide statistics
 */
const reviewOrganisationSchema = z.object({ body: z.object({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  reason: z.string().trim().max(2000).optional(),
}) });
router.get("/organisations", canReviewOrganisations, adminController.listOrganisations);
router.patch("/organisations/:businessId/review", canReviewOrganisations, validate(reviewOrganisationSchema), adminController.reviewOrganisation);

const adminOAuthClientUpdateSchema = z.object({ body: z.object({
  name: z.string().trim().min(2).max(100).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(50).optional(),
  scopes: z.array(z.string().min(1)).min(1).max(30).optional(),
  isConfidential: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0, "At least one field is required") });
router.get("/oauth-clients", canManageSecurity, adminController.listOAuthClients);
router.patch("/oauth-clients/:clientId", canManageSecurity, validate(adminOAuthClientUpdateSchema), adminController.updateOAuthClient);

router.get("/entity-reviewers", canManageAdmins, spotlightReviewAccessController.list);
router.post("/entity-reviewers", canManageAdmins, validate(z.object({ body: z.object({ username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/) }) })), spotlightReviewAccessController.grant);
router.delete("/entity-reviewers/:userId", canManageAdmins, spotlightReviewAccessController.revoke);


const betaReviewSchema = z.object({ body: z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
}) });
const betaAnnouncementSchema = z.object({ body: z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(1).max(12000),
  productReference: z.string().trim().min(1).max(80),
}) });
router.get("/beta/applications", canManageBeta, betaController.listApplications);
router.patch("/beta/applications/:applicationId/review", canManageBeta, validate(betaReviewSchema), betaController.reviewApplication);
router.get("/beta/announcements", canManageBeta, betaController.listAnnouncements);
router.get("/beta/issue-reports", canManageBeta, betaController.listIssueReports);
router.patch("/beta/issue-reports/:reportId", canManageBeta, validate(z.object({ body: z.object({ status: z.enum(["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"]), adminNote: z.string().trim().max(4000).optional() }) })), betaController.updateIssueReport);
router.post("/beta/announcements", canManageBeta, validate(betaAnnouncementSchema), betaController.createAnnouncement);

router.get("/diagnostics/summary", canViewDiagnostics, diagnosticsController.summary);
router.get("/diagnostics/events", canViewDiagnostics, diagnosticsController.events);
router.get("/diagnostics/health", canViewDiagnostics, diagnosticsController.health);

router.get("/stats", canManageUsers, adminController.stats);

export default router;
