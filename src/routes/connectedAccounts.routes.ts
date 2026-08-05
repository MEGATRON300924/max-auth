import { Router } from "express";
import { connectedAccountsController } from "../controllers/connectedAccounts.controller";
import { authenticate } from "../middleware/authenticate";

const router = Router();

router.use(authenticate);

/** @openapi /connected-accounts: get: tags: [Connected Accounts] summary: List linked third-party accounts */
router.get("/", connectedAccountsController.list);

/**
 * @openapi
 * /connected-accounts/{accountId}:
 *   delete:
 *     tags: [Connected Accounts]
 *     summary: Unlink a connected third-party account
 */
router.delete("/:accountId", connectedAccountsController.unlink);

// NOTE: Provider-specific OAuth link flows (Google, X, Instagram, Snapchat,
// Spotify, Discord, GitHub) are intentionally not implemented — only the
// data model + link/unlink management endpoints exist per spec.

export default router;
