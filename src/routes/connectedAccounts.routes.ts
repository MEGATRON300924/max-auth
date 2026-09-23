import { Router } from "express";
import { connectedAccountsController } from "../controllers/connectedAccounts.controller";
import { authenticate } from "../middleware/authenticate";
import { oauthRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.get("/spotify/callback", connectedAccountsController.spotifyCallback);
router.get("/google/calendar/callback", connectedAccountsController.googleCalendarCallback);

router.use(authenticate);

router.get("/google/calendar", connectedAccountsController.googleCalendarList);
router.get("/google/calendar/events", connectedAccountsController.googleCalendarEvents);
router.get("/google/calendar/events/:eventId", connectedAccountsController.googleCalendarEvent);
router.post("/google/calendar/events", connectedAccountsController.googleCalendarCreateEvent);
router.patch("/google/calendar/events/:eventId", connectedAccountsController.googleCalendarUpdateEvent);
router.delete("/google/calendar/events/:eventId", connectedAccountsController.googleCalendarDeleteEvent);

router.get("/google/drive/files", connectedAccountsController.googleDriveFiles);
router.get("/google/drive/files/:fileId", connectedAccountsController.googleDriveFile);
router.post("/google/drive/files", connectedAccountsController.googleDriveCreate);
router.patch("/google/drive/files/:fileId", connectedAccountsController.googleDriveUpdate);
router.delete("/google/drive/files/:fileId", connectedAccountsController.googleDriveDelete);

router.get("/google/docs/:documentId", connectedAccountsController.googleDoc);
router.post("/google/docs/:documentId/batchUpdate", connectedAccountsController.googleDocUpdate);

router.get("/google/sheets/:spreadsheetId", connectedAccountsController.googleSheet);
router.put("/google/sheets/:spreadsheetId/values", connectedAccountsController.googleSheetUpdate);

router.get("/google/slides/:presentationId", connectedAccountsController.googleSlides);
router.post("/google/slides/:presentationId/batchUpdate", connectedAccountsController.googleSlidesUpdate);

router.get("/google/gmail/messages", connectedAccountsController.gmailMessages);
router.get("/google/gmail/messages/:messageId", connectedAccountsController.gmailMessage);
router.post("/google/gmail/messages/send", connectedAccountsController.gmailSend);
router.post("/google/gmail/messages/:messageId/modify", connectedAccountsController.gmailModify);

router.get("/google/tasks/lists", connectedAccountsController.googleTaskLists);
router.get("/google/tasks", connectedAccountsController.googleTasks);
router.post("/google/tasks", connectedAccountsController.googleTaskCreate);
router.patch("/google/tasks/:taskId", connectedAccountsController.googleTaskUpdate);
router.delete("/google/tasks/:taskId", connectedAccountsController.googleTaskDelete);

router.get("/google/contacts", connectedAccountsController.googleContacts);

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
