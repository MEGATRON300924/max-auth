import { Router } from "express";
import { securityController } from "../controllers/security.controller";
import { authenticate } from "../middleware/authenticate";

const router = Router();

/** @openapi /security/csrf-token: get: tags: [Security] summary: Get a CSRF token for cookie-based requests */
router.get("/csrf-token", securityController.csrfToken);

/** @openapi /security/audit-logs: get: tags: [Security] summary: List audit log entries for the authenticated user */
router.get("/audit-logs", authenticate, securityController.auditLogs);

/** @openapi /security/usage: get: tags: [Security] summary: Return API usage analytics for the authenticated user */
router.get("/usage", authenticate, securityController.usage);

export default router;
