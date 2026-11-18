import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { betaController } from "../controllers/beta.controller";

const router = Router();
router.use(authenticate);

const productOptions = [
  "MAX AI", "MAX Home", "MAX Music", "MAX Browser", "MAX TV", "MAX Cloud",
  "MAX Store", "MAX Connect", "MAX Car OS", "MAX Business", "MAX Security", "MAX OS",
  "MAX Pay", "MAX Studio", "MAX Voice", "MAX Spotlight Graph", "MAX Auth",
] as const;

const applicationSchema = z.object({ body: z.object({
  fullName: z.string().trim().min(2).max(128),
  devices: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  products: z.array(z.enum(productOptions)).min(1).max(productOptions.length),
}) });

router.get("/application", betaController.getMyApplication);
router.post("/applications", validate(applicationSchema), betaController.submitApplication);
router.get("/notifications", betaController.listMyNotifications);
router.patch("/notifications/:notificationId/read", betaController.markNotificationRead);

export default router;
