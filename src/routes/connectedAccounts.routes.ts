import { Router } from "express";
import { connectedAccountsController } from "../controllers/connectedAccounts.controller";
import { authenticate } from "../middleware/authenticate";
import { oauthRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.get("/spotify/callback", connectedAccountsController.spotifyCallback);
router.get("/google/calendar/callback", connectedAccountsController.googleCalendarCallback);

router.use(authenticate);

router.get("/spotify/connect", oauthRateLimiter, connectedAccountsController.spotifyConnect);
router.get("/google/calendar/connect", oauthRateLimiter, connectedAccountsController.googleCalendarConnect);
router.post("/spotify/refresh", oauthRateLimiter, connectedAccountsController.spotifyRefresh);

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

// Spotify has a live OAuth + PKCE connection flow above. Other provider-specific
// OAuth link flows remain future integrations; generic link/unlink management
// endpoints are still available for providers that are linked by trusted flows.

export default router;
