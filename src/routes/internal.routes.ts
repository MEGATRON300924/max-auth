import { Router } from "express";
import { z } from "zod";
import { prisma } from "../database/prisma";
import { ok } from "../utils/response";
import { authenticateMaxService } from "../middleware/serviceAuthenticate";
import { personalizationController } from "../controllers/personalization.controller";
import { internalGoogleController } from "../controllers/internalGoogle.controller";
import { internalSpotifyController } from "../controllers/internalSpotify.controller";
import { mailService } from "../services/mail.service";
import { env } from "../config/env";

const router = Router();

router.use("/users/:userId", authenticateMaxService);

const internalEmailSchema = z.object({
  to: z.string().trim().email().max(255),
  subject: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(10000),
  html: z.string().max(30000).optional()
});

router.get("/users/:userId/lookup/username/:username", async (req, res, next) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!/^[a-zA-Z0-9_.]{3,32}$/.test(username)) {
      return res.status(400).json({ success: false, error: { code: "INVALID_USERNAME", message: "A valid MAX Auth username is required." } });
    }
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true, username: true, email: true }
    });
    if (!user) return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND", message: "MAX Auth account not found." } });
    if (!user.email) return res.status(422).json({ success: false, error: { code: "USER_EMAIL_UNAVAILABLE", message: "This MAX Auth account does not have an email address." } });
    return ok(res, { user: { username: user.username, email: user.email } });
  } catch (error) { next(error); }
});

router.post("/users/:userId/email/send", async (req, res, next) => {
  const parsed = internalEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: "INVALID_EMAIL_PAYLOAD", message: "A recipient, subject, and message are required." } });
  if (env.MAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY) {
    return res.status(503).json({ success: false, error: { code: "EMAIL_DELIVERY_NOT_CONFIGURED", message: "MAX Auth email delivery is not configured for production. Configure MAIL_PROVIDER=resend, RESEND_API_KEY, and MAIL_FROM in the MAX Auth service." } });
  }
  try {
    await mailService.send(parsed.data);
    return ok(res, { sent: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/users/:userId/family-status", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, status: true } });
    if (!user) return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND", message: "MAX Auth account not found." } });
    const consent = await prisma.familyConsentRequest.findUnique({ where: { childUserId: user.id }, select: { ageGroup: true, status: true } });
    return ok(res, { accountStatus: user.status, ageGroup: consent?.ageGroup ?? null, parentalConsentStatus: consent?.status ?? null, canUseAdultRole: user.status === "ACTIVE" && consent === null });
  } catch (error) { next(error); }
});

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


router.get("/users/:userId/spotify/search", internalSpotifyController.search);
router.get("/users/:userId/spotify/me", internalSpotifyController.me);
router.get("/users/:userId/spotify/saved", internalSpotifyController.saved);
router.get("/users/:userId/spotify/playlists", internalSpotifyController.playlists);
router.get("/users/:userId/spotify/top/artists", internalSpotifyController.topArtists);
router.get("/users/:userId/spotify/top/tracks", internalSpotifyController.topTracks);
router.get("/users/:userId/spotify/recently-played", internalSpotifyController.recentlyPlayed);
router.get("/users/:userId/spotify/player", internalSpotifyController.currentlyPlaying);
router.put("/users/:userId/spotify/player/play", internalSpotifyController.play);
router.put("/users/:userId/spotify/player/pause", internalSpotifyController.pause);
router.post("/users/:userId/spotify/player/next", internalSpotifyController.next);
router.post("/users/:userId/spotify/player/previous", internalSpotifyController.previous);

export default router;