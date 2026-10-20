import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";
import { validate } from "../middleware/validate";
import { statusController } from "../controllers/status.controller";

const router = Router();

const updateServiceSchema = z.object({
  body: z.object({
    status: z.enum(["green", "yellow", "red"]),
    reason: z.string().trim().max(1000).optional().default(""),
  }),
  params: z.object({
    serviceKey: z.string().trim().min(1).max(100),
  }),
});

/**
 * @openapi
 * /status:
 *   get:
 *     tags: [Status]
 *     summary: Get public MAX ecosystem service statuses
 *     security: []
 */
router.get("/", statusController.getPublicStatus);

/**
 * @openapi
 * /status/services/{serviceKey}:
 *   patch:
 *     tags: [Status]
 *     summary: Update a service status (MAX Auth administrators only)
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  "/services/:serviceKey",
  authenticate,
  requireAdmin,
  validate(updateServiceSchema),
  statusController.updateService,
);

export default router;
