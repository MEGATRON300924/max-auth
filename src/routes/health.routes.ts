import { Router } from "express";
import { healthController } from "../controllers/health.controller";

const router = Router();

/** @openapi /health/live: get: tags: [Health] summary: Liveness probe */
router.get("/live", healthController.liveness);

/** @openapi /health/ready: get: tags: [Health] summary: Readiness probe (checks DB connectivity) */
router.get("/ready", healthController.readiness);

export default router;
