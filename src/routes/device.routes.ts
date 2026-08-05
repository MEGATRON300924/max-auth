import { Router } from "express";
import { deviceController } from "../controllers/device.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { revokeDeviceSchema, revokeSessionSchema } from "../validators/profile.validators";

const router = Router();

router.use(authenticate);

/** @openapi /devices: get: tags: [Devices] summary: List the authenticated user's known devices */
router.get("/", deviceController.listDevices);

/** @openapi /devices/{deviceId}/trust: post: tags: [Devices] summary: Mark a device as trusted */
router.post("/:deviceId/trust", validate(revokeDeviceSchema), deviceController.trustDevice);

/** @openapi /devices/{deviceId}: delete: tags: [Devices] summary: Revoke/remove a device */
router.delete("/:deviceId", validate(revokeDeviceSchema), deviceController.revokeDevice);

/** @openapi /devices/sessions: get: tags: [Devices] summary: List active sessions */
router.get("/sessions/all", deviceController.listSessions);

/** @openapi /devices/sessions/{sessionId}: delete: tags: [Devices] summary: Revoke a specific session */
router.delete(
  "/sessions/:sessionId",
  validate(revokeSessionSchema),
  deviceController.revokeSession
);

/** @openapi /devices/sessions: delete: tags: [Devices] summary: Revoke all sessions (log out everywhere) */
router.delete("/sessions", deviceController.revokeAllSessions);

/** @openapi /devices/login-history: get: tags: [Devices] summary: List login history */
router.get("/login-history", deviceController.loginHistory);

export default router;
