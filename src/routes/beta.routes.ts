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
router.post("/issue-reports", validate(z.object({ body: z.object({ product: z.string().trim().min(1).max(80), category: z.string().trim().min(1).max(40), severity: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]), title: z.string().trim().min(3).max(180), description: z.string().trim().min(5).max(8000), stepsToReproduce: z.string().max(8000).optional(), expectedBehaviour: z.string().max(4000).optional(), actualBehaviour: z.string().max(4000).optional() }) })), betaController.submitIssueReport);
router.get("/issue-reports", betaController.listMyIssueReports);
router.post("/chat-reports", validate(z.object({ body: z.object({ product: z.string().trim().max(80).optional(), category: z.enum(["INCORRECT_RESPONSE", "FAILED_RESPONSE", "TOOL_FAILURE", "SLOW_RESPONSE", "UI_BUG", "OTHER"]), severity: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]), title: z.string().trim().min(3).max(180), description: z.string().trim().min(5).max(8000), conversationId: z.string().max(128).optional(), messageId: z.string().max(128).optional(), userMessage: z.string().max(8000).optional(), assistantResponse: z.string().max(12000).optional(), errorMessage: z.string().max(4000).optional(), pageUrl: z.string().max(1000).optional(), model: z.string().max(128).optional(), clientMetadata: z.string().max(4000).optional() }) })), betaController.submitChatReport);
router.post("/applications", validate(applicationSchema), betaController.submitApplication);
router.get("/notifications", betaController.listMyNotifications);
router.patch("/notifications/:notificationId/read", betaController.markNotificationRead);

export default router;
