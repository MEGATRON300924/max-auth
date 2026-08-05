import { Router } from "express";
import authRoutes from "./auth.routes";
import profileRoutes from "./profile.routes";
import deviceRoutes from "./device.routes";
import securityRoutes from "./security.routes";
import connectedAccountsRoutes from "./connectedAccounts.routes";
import oauthRoutes from "./oauth.routes";
import adminRoutes from "./admin.routes";
import healthRoutes from "./health.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/devices", deviceRoutes);
router.use("/security", securityRoutes);
router.use("/connected-accounts", connectedAccountsRoutes);
router.use("/oauth", oauthRoutes);
router.use("/admin", adminRoutes);
router.use("/health", healthRoutes);

export default router;
