import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { familyService } from "../services/family.service";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";

const router = Router();
const tokenSchema = z.object({ token: z.string().trim().min(30).max(200) });
const approveSchema = tokenSchema.extend({ guardianAttestation: z.literal(true) });

router.get("/parental-consent", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const parsed = tokenSchema.safeParse({ token: req.query.token });
    if (!parsed.success) throw AppError.badRequest("A valid approval token is required.", "INVALID_TOKEN");
    return ok(res, await familyService.getRequest(parsed.data.token));
  } catch (error) { next(error); }
});

router.post("/parental-consent/approve", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Confirm that you are the child's parent or legal guardian.", "VALIDATION_ERROR");
    return ok(res, await familyService.approve(parsed.data.token, { guardianAttestation: true }));
  } catch (error) { next(error); }
});

router.post("/parental-consent/approve-with-account", authenticate, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Confirm that you are the child's parent or legal guardian.", "VALIDATION_ERROR");
    const user = req.user as { sub: string; email?: string };
    const profile = await import("../services/user.service").then((module) => module.userService.getProfile(user.sub));
    return ok(res, await familyService.approve(parsed.data.token, {
      parentUserId: user.sub,
      parentEmail: profile.email,
      guardianAttestation: true
    }));
  } catch (error) { next(error); }
});

router.post("/parental-consent/decline", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Confirm that you are the child's parent or legal guardian.", "VALIDATION_ERROR");
    return ok(res, await familyService.decline(parsed.data.token, true));
  } catch (error) { next(error); }
});

export default router;
