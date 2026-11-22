import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notificationController } from "../controllers/notification.controller";
const router = Router();
router.use(authenticate);
router.get("/", notificationController.list);
router.patch("/:notificationId/read", notificationController.markRead);
export default router;
