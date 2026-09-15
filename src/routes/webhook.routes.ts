import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { webhookController } from "../controllers/webhook.controller";

const router = Router();

router.get("/events", authenticate, webhookController.events);
router.get("/", authenticate, webhookController.list);
router.post("/", authenticate, webhookController.create);
router.patch("/:endpointId", authenticate, webhookController.update);
router.post("/:endpointId/rotate-secret", authenticate, webhookController.rotateSecret);
router.delete("/:endpointId", authenticate, webhookController.remove);
router.get("/:endpointId/deliveries", authenticate, webhookController.deliveries);
router.post("/:endpointId/test", authenticate, webhookController.test);

export default router;
