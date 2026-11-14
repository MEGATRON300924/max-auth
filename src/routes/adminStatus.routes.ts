import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { authenticateOAuthAdmin } from "../middleware/authenticateOAuthAdmin";
import { statusController } from "../controllers/status.controller";

const serviceStatusSchema = z.record(z.object({
  status: z.enum(["green", "yellow", "red"]),
  reason: z.string().max(1000),
}));

const router = Router();
router.use(authenticateOAuthAdmin);
router.get("/", statusController.get);
router.put("/", validate(z.object({ body: z.object({ status: serviceStatusSchema }) })), statusController.update);
export default router;
