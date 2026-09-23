import { Request, Response, NextFunction } from "express";
import { connectedAccountsService } from "../services/connectedAccounts.service";
import { getRequestContext } from "../utils/requestContext";
import { ok } from "../utils/response";
import { env } from "../config/env";

export const connectedAccountsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const accounts = await connectedAccountsService.list(req.user!.sub);
      return ok(res, { accounts });
    } catch (err) {
      next(err);
    }
  },

  async googleCalendarConnect(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await connectedAccountsService.createGoogleCalendarAuthorizationUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) { next(err); }
  },

  async googleCalendarCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.handleGoogleCalendarCallback({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + `/connected-apps?google_calendar=${result.status}`);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?google_calendar=error");
    }
  },

  async googleCalendarList(req: Request, res: Response, next: NextFunction) {
    try {
      const calendars = await connectedAccountsService.listGoogleCalendars(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { calendars });
    } catch (err) { next(err); }
  },

  async googleCalendarEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const events = await connectedAccountsService.listGoogleCalendarEvents(req.user!.sub, {
        calendarId: typeof req.query.calendarId === "string" ? req.query.calendarId : undefined,
        timeMin: typeof req.query.timeMin === "string" ? req.query.timeMin : undefined,
        timeMax: typeof req.query.timeMax === "string" ? req.query.timeMax : undefined,
        maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
        pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { events });
    } catch (err) { next(err); }
  },

  async googleCalendarEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const calendarId = typeof req.query.calendarId === "string" ? req.query.calendarId : "primary";
      const eventId = typeof req.params.eventId === "string" ? req.params.eventId : "";
      const event = await connectedAccountsService.getGoogleCalendarEvent(req.user!.sub, eventId, calendarId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { event });
    } catch (err) { next(err); }
  },

  async googleCalendarCreateEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const calendarId = typeof req.query.calendarId === "string" ? req.query.calendarId : "primary";
      const event = await connectedAccountsService.createGoogleCalendarEvent(req.user!.sub, req.body || {}, calendarId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { event });
    } catch (err) { next(err); }
  },

  async googleCalendarUpdateEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const calendarId = typeof req.query.calendarId === "string" ? req.query.calendarId : "primary";
      const eventId = typeof req.params.eventId === "string" ? req.params.eventId : "";
      const event = await connectedAccountsService.updateGoogleCalendarEvent(req.user!.sub, eventId, req.body || {}, calendarId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { event });
    } catch (err) { next(err); }
  },

  async googleCalendarDeleteEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const calendarId = typeof req.query.calendarId === "string" ? req.query.calendarId : "primary";
      const eventId = typeof req.params.eventId === "string" ? req.params.eventId : "";
      const result = await connectedAccountsService.deleteGoogleCalendarEvent(req.user!.sub, eventId, calendarId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (err) { next(err); }
  },

  async googleDriveFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const files = await connectedAccountsService.listGoogleDriveFiles(req.user!.sub, {
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        pageSize: typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined,
        pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
        orderBy: typeof req.query.orderBy === "string" ? req.query.orderBy : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { files });
    } catch (err) { next(err); }
  },

  async googleDriveFile(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await connectedAccountsService.getGoogleDriveFile(req.user!.sub, req.params.fileId, req.query.download === "true");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { file });
    } catch (err) { next(err); }
  },

  async googleDriveCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await connectedAccountsService.createGoogleDriveFile(req.user!.sub, req.body || {});
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { file });
    } catch (err) { next(err); }
  },

  async googleDriveUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await connectedAccountsService.updateGoogleDriveFile(req.user!.sub, req.params.fileId, req.body || {});
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { file });
    } catch (err) { next(err); }
  },

  async googleDriveDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.deleteGoogleDriveFile(req.user!.sub, req.params.fileId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (err) { next(err); }
  },

  async googleDoc(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await connectedAccountsService.getGoogleDoc(req.user!.sub, req.params.documentId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { document });
    } catch (err) { next(err); }
  },

  async googleDocUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.updateGoogleDoc(req.user!.sub, req.params.documentId, Array.isArray(req.body?.requests) ? req.body.requests : []);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (err) { next(err); }
  },

  async googleSheet(req: Request, res: Response, next: NextFunction) {
    try {
      const spreadsheet = await connectedAccountsService.getGoogleSheet(req.user!.sub, req.params.spreadsheetId, typeof req.query.range === "string" ? req.query.range : undefined);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { spreadsheet });
    } catch (err) { next(err); }
  },

  async googleSheetUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.updateGoogleSheet(req.user!.sub, req.params.spreadsheetId, String(req.body?.range || ""), Array.isArray(req.body?.values) ? req.body.values : [], String(req.body?.valueInputOption || "USER_ENTERED"));
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (err) { next(err); }
  },

  async googleSlides(req: Request, res: Response, next: NextFunction) {
    try {
      const presentation = await connectedAccountsService.getGoogleSlides(req.user!.sub, req.params.presentationId);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { presentation });
    } catch (err) { next(err); }
  },

  async googleSlidesUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.updateGoogleSlides(req.user!.sub, req.params.presentationId, Array.isArray(req.body?.requests) ? req.body.requests : []);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (err) { next(err); }
  },

  async gmailMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const messages = await connectedAccountsService.listGmailMessages(req.user!.sub, {
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
        pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { messages });
    } catch (err) { next(err); }
  },

  async gmailMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const message = await connectedAccountsService.getGmailMessage(req.user!.sub, req.params.messageId, typeof req.query.format === "string" ? req.query.format : "full");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { message });
    } catch (err) { next(err); }
  },

  async gmailSend(req: Request, res: Response, next: NextFunction) {
    try {
      const message = await connectedAccountsService.sendGmailMessage(req.user!.sub, String(req.body?.raw || ""));
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { message });
    } catch (err) { next(err); }
  },

  async gmailModify(req: Request, res: Response, next: NextFunction) {
    try {
      const message = await connectedAccountsService.modifyGmailMessage(req.user!.sub, req.params.messageId, Array.isArray(req.body?.addLabelIds) ? req.body.addLabelIds : [], Array.isArray(req.body?.removeLabelIds) ? req.body.removeLabelIds : []);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { message });
    } catch (err) { next(err); }
  },

  async googleTaskLists(req: Request, res: Response, next: NextFunction) {
    try {
      const lists = await connectedAccountsService.listGoogleTaskLists(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { lists });
    } catch (err) { next(err); }
  },

  async googleTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const tasks = await connectedAccountsService.listGoogleTasks(req.user!.sub, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { tasks });
    } catch (err) { next(err); }
  },

  async googleTaskCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await connectedAccountsService.createGoogleTask(req.user!.sub, req.body || {}, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { task });
    } catch (err) { next(err); }
  },

  async googleTaskUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await connectedAccountsService.updateGoogleTask(req.user!.sub, req.params.taskId, req.body || {}, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { task });
    } catch (err) { next(err); }
  },

  async googleTaskDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.deleteGoogleTask(req.user!.sub, req.params.taskId, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default");
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (err) { next(err); }
  },

  async googleContacts(req: Request, res: Response, next: NextFunction) {
    try {
      const contacts = await connectedAccountsService.listGoogleContacts(req.user!.sub, typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : 100);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { contacts });
    } catch (err) { next(err); }
  },

  async spotifyConnect(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await connectedAccountsService.createSpotifyAuthorizationUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) {
      next(err);
    }
  },

  async spotifyCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await connectedAccountsService.handleSpotifyCallback(
        {
          code: typeof req.query.code === "string" ? req.query.code : undefined,
          state: typeof req.query.state === "string" ? req.query.state : undefined,
          error: typeof req.query.error === "string" ? req.query.error : undefined,
        },
        req,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + `/connected-apps?spotify=${result.status}`);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?spotify=error");
    }
  },

  async spotifyRefresh(req: Request, res: Response, next: NextFunction) {
    try {
      const account = await connectedAccountsService.refreshSpotify(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { account });
    } catch (err) {
      next(err);
    }
  },

  async unlink(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await connectedAccountsService.unlink(req.user!.sub, req.params.accountId, ctx);
      return ok(res, { message: "Account unlinked" });
    } catch (err) {
      next(err);
    }
  },
};
