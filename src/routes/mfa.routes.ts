import { Router } from "express";
import { mfaController } from "../controllers/mfa.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiter";
import { mfaPasswordSchema, mfaCodeSchema } from "../validators/mfa.validators";

const router = Router();
router.use(authenticate);
router.get("/", mfaController.status);
router.post("/setup", sensitiveActionRateLimiter, validate(mfaPasswordSchema), mfaController.beginSetup);
router.post("/enable", sensitiveActionRateLimiter, validate(mfaCodeSchema), mfaController.enable);
router.post("/recovery-codes/regenerate", sensitiveActionRateLimiter, validate(mfaCodeSchema), mfaController.regenerateRecoveryCodes);
router.post("/disable", sensitiveActionRateLimiter, validate(mfaCodeSchema), mfaController.disable);
export default router;
