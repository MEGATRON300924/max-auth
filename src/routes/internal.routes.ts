import { Router } from "express";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../database/prisma";
import { authenticateMaxService } from "../middleware/serviceAuthenticate";
import { authenticateMaxServiceOnly } from "../middleware/serviceAuthenticateOnly";
import { personalizationController } from "../controllers/personalization.controller";
import { internalGoogleController } from "../controllers/internalGoogle.controller";
import { internalSpotifyController } from "../controllers/internalSpotify.controller";
import { ok } from "../utils/response";

const router = Router();

// Reverse lookup used by MAX's Discord bot after Discord OAuth linking.
// Only returns the minimum profile needed to map a Discord identity to MAX Auth.
router.get("/discord/identity", authenticateMaxServiceOnly, async (req, res, next) => {
  try {
    const discordUserId = typeof req.query.discordUserId === "string" ? req.query.discordUserId : "";
    if (!/^\d{5,25}$/.test(discordUserId)) {
      return res.status(400).json({ success: false, error: { code: "DISCORD_USER_ID_INVALID", message: "A valid Discord user ID is required" } });
    }

    const account = await prisma.connectedAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: ConnectedProvider.DISCORD,
          providerAccountId: discordUserId,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            displayName: true,
            status: true,
            subscriptionTier: true,
            language: true,
            timezone: true,
          },
        },
      },
    });

    const user = account?.user;
    if (!user || user.status !== "ACTIVE") {
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { linked: false });
    }

    res.setHeader("Cache-Control", "no-store");
    return ok(res, {
      linked: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.fullName || user.username,
        tier: user.subscriptionTier,
        locale: user.language,
        timezone: user.timezone,
      },
    });
  } catch (error) {
    next(error);
  }
});

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
