import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { religionPreferenceController } from "../controllers/religionPreference.controller";

const router = Router();
const notificationPreferencesSchema = z.record(z.string().max(80), z.boolean()).refine(
  value => Object.keys(value).length <= 40,
  "A maximum of 40 notification preferences is allowed"
);
const saveReligionPreferenceSchema = z.object({
  body: z.object({
    religion: z.enum(["christianity", "jehovahs_witness", "islam", "hinduism", "buddhism", "judaism", "traditional_religion", "other", "prefer_not_to_say"]),
    tradition: z.string().trim().max(120).optional(),
    otherReligion: z.string().trim().max(120).optional(),
    notificationPreferences: notificationPreferencesSchema.optional(),
  }).strict(),
});

router.use(authenticate);
router.get("/", religionPreferenceController.get);
router.put("/", validate(saveReligionPreferenceSchema), religionPreferenceController.save);
router.patch("/defer", religionPreferenceController.defer);
router.patch("/notifications", validate(z.object({ body: z.object({ notificationPreferences: notificationPreferencesSchema }).strict() })), religionPreferenceController.saveNotifications);
router.patch("/notifications/complete", religionPreferenceController.completeNotifications);
router.delete("/", religionPreferenceController.clear);

export default router;
