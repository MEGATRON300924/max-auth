import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { adminController } from "../controllers/admin.controller";
import { authenticate } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";
import { spotlightReviewAccessController } from "../controllers/spotlightReviewAccess.controller";
import { betaController } from "../controllers/beta.controller";
import { diagnosticsController } from "../controllers/diagnostics.controller";

const router = Router();

router.use(authenticate, requireAdmin);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List/search users (paginated)
 */
router.get("/users", adminController.listUsers);

/**
 * @openapi
 * /admin/users/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single user by ID
 */
router.get("/users/:userId", adminController.getUser);

/**
 * @openapi
 * /admin/users/{userId}/suspend:
 *   post:
 *     tags: [Admin]
 *     summary: Suspend a user account
 */
router.post("/users/:userId/suspend", adminController.suspendUser);

/**
 * @openapi
 * /admin/users/{userId}/reactivate:
 *   post:
 *     tags: [Admin]
 *     summary: Reactivate a suspended user account
 */
router.post("/users/:userId/reactivate", adminController.reactivateUser);

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
router.get("/organisations", adminController.listOrganisations);
router.patch("/organisations/:businessId/review", validate(reviewOrganisationSchema), adminController.reviewOrganisation);

const adminOAuthClientUpdateSchema = z.object({ body: z.object({
  name: z.string().trim().min(2).max(100).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(50).optional(),
  scopes: z.array(z.string().min(1)).min(1).max(30).optional(),
  isConfidential: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0, "At least one field is required") });
router.get("/oauth-clients", adminController.listOAuthClients);
router.patch("/oauth-clients/:clientId", validate(adminOAuthClientUpdateSchema), adminController.updateOAuthClient);

router.get("/entity-reviewers", spotlightReviewAccessController.list);
router.post("/entity-reviewers", validate(z.object({ body: z.object({ username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/) }) })), spotlightReviewAccessController.grant);
router.delete("/entity-reviewers/:userId", spotlightReviewAccessController.revoke);


const betaReviewSchema = z.object({ body: z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
}) });
const betaAnnouncementSchema = z.object({ body: z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(1).max(12000),
  productReference: z.string().trim().min(1).max(80),
}) });
router.get("/beta/applications", betaController.listApplications);
router.patch("/beta/applications/:applicationId/review", validate(betaReviewSchema), betaController.reviewApplication);
router.get("/beta/announcements", betaController.listAnnouncements);
router.get("/beta/issue-reports", betaController.listIssueReports);
router.patch("/beta/issue-reports/:reportId", validate(z.object({ body: z.object({ status: z.enum(["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"]), adminNote: z.string().trim().max(4000).optional() }) })), betaController.updateIssueReport);
router.post("/beta/announcements", validate(betaAnnouncementSchema), betaController.createAnnouncement);

router.get("/diagnostics/summary", diagnosticsController.summary);
router.get("/diagnostics/events", diagnosticsController.events);
router.get("/diagnostics/health", diagnosticsController.health);

router.get("/stats", adminController.stats);

export default router;
