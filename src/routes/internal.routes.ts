import { Router } from "express";
import { authenticateMaxService } from "../middleware/serviceAuthenticate";
import { personalizationController } from "../controllers/personalization.controller";
import { internalGoogleController } from "../controllers/internalGoogle.controller";

const router = Router();

router.use(authenticateMaxService);

router.get("/users/:userId/personalization", personalizationController.snapshot);
router.patch("/users/:userId/personalization", personalizationController.updateProfile);
router.patch("/users/:userId/personalization/services/:provider", personalizationController.updateServiceSignals);

router.get("/users/:userId/google/calendar", internalGoogleController.calendars);
router.get("/users/:userId/google/calendar/events", internalGoogleController.calendarEvents);
router.post("/users/:userId/google/calendar/events", internalGoogleController.createCalendarEvent);
router.patch("/users/:userId/google/calendar/events/:eventId", internalGoogleController.updateCalendarEvent);
router.delete("/users/:userId/google/calendar/events/:eventId", internalGoogleController.deleteCalendarEvent);

router.get("/users/:userId/google/drive/files", internalGoogleController.driveFiles);
router.get("/users/:userId/google/drive/files/:fileId", internalGoogleController.driveFile);
router.post("/users/:userId/google/drive/files", internalGoogleController.createDriveFile);
router.patch("/users/:userId/google/drive/files/:fileId", internalGoogleController.updateDriveFile);
router.delete("/users/:userId/google/drive/files/:fileId", internalGoogleController.deleteDriveFile);

router.get("/users/:userId/google/docs/:documentId", internalGoogleController.doc);
router.post("/users/:userId/google/docs/:documentId/batchUpdate", internalGoogleController.updateDoc);

router.get("/users/:userId/google/sheets/:spreadsheetId", internalGoogleController.sheet);
router.put("/users/:userId/google/sheets/:spreadsheetId/values", internalGoogleController.updateSheet);

router.get("/users/:userId/google/slides/:presentationId", internalGoogleController.slides);
router.post("/users/:userId/google/slides/:presentationId/batchUpdate", internalGoogleController.updateSlides);

router.get("/users/:userId/google/gmail/messages", internalGoogleController.gmailMessages);
router.get("/users/:userId/google/gmail/messages/:messageId", internalGoogleController.gmailMessage);
router.post("/users/:userId/google/gmail/messages/send", internalGoogleController.gmailSend);
router.post("/users/:userId/google/gmail/messages/:messageId/modify", internalGoogleController.gmailModify);

router.get("/users/:userId/google/tasks/lists", internalGoogleController.taskLists);
router.get("/users/:userId/google/tasks", internalGoogleController.tasks);
router.post("/users/:userId/google/tasks", internalGoogleController.createTask);
router.patch("/users/:userId/google/tasks/:taskId", internalGoogleController.updateTask);
router.delete("/users/:userId/google/tasks/:taskId", internalGoogleController.deleteTask);

router.get("/users/:userId/google/contacts", internalGoogleController.contacts);

router.get("/users/:userId/google/youtube/channels", internalGoogleController.youtubeChannels);
router.get("/users/:userId/google/youtube/subscriptions", internalGoogleController.youtubeSubscriptions);
router.get("/users/:userId/google/youtube/search", internalGoogleController.youtubeSearch);
router.get("/users/:userId/google/youtube/videos", internalGoogleController.youtubeVideos);

export default router;
