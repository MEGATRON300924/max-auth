import { Router } from "express";
import { profileController } from "../controllers/profile.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { updateProfileSchema, updateAIProfileSchema } from "../validators/profile.validators";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get the authenticated user's profile
 */
router.get("/", profileController.getProfile);

/**
 * @openapi
 * /profile:
 *   patch:
 *     tags: [Profile]
 *     summary: Update the authenticated user's profile
 */
router.patch("/", validate(updateProfileSchema), profileController.updateProfile);

/**
 * @openapi
 * /profile/ai:
 *   get:
 *     tags: [Profile]
 *     summary: Get the AI personalization profile (interests, preferences, etc.)
 */
router.get("/ai", profileController.getAIProfile);

/**
 * @openapi
 * /profile/ai:
 *   patch:
 *     tags: [Profile]
 *     summary: Update the AI personalization profile
 */
router.patch("/ai", validate(updateAIProfileSchema), profileController.updateAIProfile);

export default router;
