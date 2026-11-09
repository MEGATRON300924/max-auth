import { Router } from "express";
import { avatarController } from "../controllers/avatar.controller";
import { authenticateProfile } from "../middleware/authenticateProfile";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();
router.use(authenticateProfile);
router.post("/sign", avatarController.signUpload);
router.post("/sign-spotlight", validate(z.object({ body: z.object({ entityPublicId: z.string().min(6).max(80) }) })), avatarController.signSpotlightUpload);
router.post("/complete", validate(z.object({ body: z.object({ publicId: z.string().min(1).max(255) }) })), avatarController.completeUpload);
export default router;
