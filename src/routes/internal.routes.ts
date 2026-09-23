import { Router } from "express";
import { authenticateMaxService } from "../middleware/serviceAuthenticate";
import { personalizationController } from "../controllers/personalization.controller";

const router = Router();

router.use(authenticateMaxService);

router.get("/users/:userId/personalization", personalizationController.snapshot);
router.patch("/users/:userId/personalization", personalizationController.updateProfile);
router.patch("/users/:userId/personalization/services/:provider", personalizationController.updateServiceSignals);

export default router;
