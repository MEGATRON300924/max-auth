import { Request, Response, NextFunction } from "express";
import { connectedAccountsService } from "../services/connectedAccounts.service";
import { ok } from "../utils/response";

export const internalGoogleController = {
  async calendars(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { calendars: await connectedAccountsService.listGoogleCalendars(req.params.userId) }); }
    catch (err) { next(err); }
  },

  async calendarEvents(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, { events: await connectedAccountsService.listGoogleCalendarEvents(req.params.userId, {
        calendarId: typeof req.query.calendarId === "string" ? req.query.calendarId : undefined,
        timeMin: typeof req.query.timeMin === "string" ? req.query.timeMin : undefined,
        timeMax: typeof req.query.timeMax === "string" ? req.query.timeMax : undefined,
        maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
        pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
      }) });
    } catch (err) { next(err); }
  },

  async createCalendarEvent(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { event: await connectedAccountsService.createGoogleCalendarEvent(req.params.userId, req.body || {}, typeof req.query.calendarId === "string" ? req.query.calendarId : "primary") }); }
    catch (err) { next(err); }
  },

  async updateCalendarEvent(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { event: await connectedAccountsService.updateGoogleCalendarEvent(req.params.userId, req.params.eventId, req.body || {}, typeof req.query.calendarId === "string" ? req.query.calendarId : "primary") }); }
    catch (err) { next(err); }
  },

  async deleteCalendarEvent(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await connectedAccountsService.deleteGoogleCalendarEvent(req.params.userId, req.params.eventId, typeof req.query.calendarId === "string" ? req.query.calendarId : "primary")); }
    catch (err) { next(err); }
  },

  async driveFiles(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { files: await connectedAccountsService.listGoogleDriveFiles(req.params.userId, {
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      pageSize: typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined,
      pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
      orderBy: typeof req.query.orderBy === "string" ? req.query.orderBy : undefined,
    }) }); }
    catch (err) { next(err); }
  },

  async driveFile(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { file: await connectedAccountsService.getGoogleDriveFile(req.params.userId, req.params.fileId, req.query.download === "true") }); }
    catch (err) { next(err); }
  },

  async createDriveFile(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { file: await connectedAccountsService.createGoogleDriveFile(req.params.userId, req.body || {}) }); }
    catch (err) { next(err); }
  },

  async updateDriveFile(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { file: await connectedAccountsService.updateGoogleDriveFile(req.params.userId, req.params.fileId, req.body || {}) }); }
    catch (err) { next(err); }
  },

  async deleteDriveFile(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await connectedAccountsService.deleteGoogleDriveFile(req.params.userId, req.params.fileId)); }
    catch (err) { next(err); }
  },

  async doc(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { document: await connectedAccountsService.getGoogleDoc(req.params.userId, req.params.documentId) }); }
    catch (err) { next(err); }
  },

  async updateDoc(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await connectedAccountsService.updateGoogleDoc(req.params.userId, req.params.documentId, Array.isArray(req.body?.requests) ? req.body.requests : [])); }
    catch (err) { next(err); }
  },

  async sheet(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { spreadsheet: await connectedAccountsService.getGoogleSheet(req.params.userId, req.params.spreadsheetId, typeof req.query.range === "string" ? req.query.range : undefined) }); }
    catch (err) { next(err); }
  },

  async updateSheet(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await connectedAccountsService.updateGoogleSheet(req.params.userId, req.params.spreadsheetId, String(req.body?.range || ""), Array.isArray(req.body?.values) ? req.body.values : [], String(req.body?.valueInputOption || "USER_ENTERED"))); }
    catch (err) { next(err); }
  },

  async slides(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { presentation: await connectedAccountsService.getGoogleSlides(req.params.userId, req.params.presentationId) }); }
    catch (err) { next(err); }
  },

  async updateSlides(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await connectedAccountsService.updateGoogleSlides(req.params.userId, req.params.presentationId, Array.isArray(req.body?.requests) ? req.body.requests : [])); }
    catch (err) { next(err); }
  },

  async gmailMessages(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { messages: await connectedAccountsService.listGmailMessages(req.params.userId, {
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
      pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
    }) }); }
    catch (err) { next(err); }
  },

  async gmailMessage(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { message: await connectedAccountsService.getGmailMessage(req.params.userId, req.params.messageId, typeof req.query.format === "string" ? req.query.format : "full") }); }
    catch (err) { next(err); }
  },

  async gmailSend(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { message: await connectedAccountsService.sendGmailMessage(req.params.userId, String(req.body?.raw || "")) }); }
    catch (err) { next(err); }
  },

  async gmailModify(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { message: await connectedAccountsService.modifyGmailMessage(req.params.userId, req.params.messageId, Array.isArray(req.body?.addLabelIds) ? req.body.addLabelIds : [], Array.isArray(req.body?.removeLabelIds) ? req.body.removeLabelIds : []) }); }
    catch (err) { next(err); }
  },

  async taskLists(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { lists: await connectedAccountsService.listGoogleTaskLists(req.params.userId) }); }
    catch (err) { next(err); }
  },

  async tasks(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { tasks: await connectedAccountsService.listGoogleTasks(req.params.userId, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default") }); }
    catch (err) { next(err); }
  },

  async createTask(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { task: await connectedAccountsService.createGoogleTask(req.params.userId, req.body || {}, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default") }); }
    catch (err) { next(err); }
  },

  async updateTask(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { task: await connectedAccountsService.updateGoogleTask(req.params.userId, req.params.taskId, req.body || {}, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default") }); }
    catch (err) { next(err); }
  },

  async deleteTask(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await connectedAccountsService.deleteGoogleTask(req.params.userId, req.params.taskId, typeof req.query.taskListId === "string" ? req.query.taskListId : "@default")); }
    catch (err) { next(err); }
  },

  async contacts(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { contacts: await connectedAccountsService.listGoogleContacts(req.params.userId, typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : 100) }); }
    catch (err) { next(err); }
  },

  async youtubeChannels(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { channels: await connectedAccountsService.listGoogleYouTubeChannels(req.params.userId) }); }
    catch (err) { next(err); }
  },

  async youtubeSubscriptions(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { subscriptions: await connectedAccountsService.listGoogleYouTubeSubscriptions(req.params.userId, {
      maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
      pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
    }) }); }
    catch (err) { next(err); }
  },

  async youtubeSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const type = req.query.type === "channel" || req.query.type === "playlist" ? req.query.type : "video";
      return ok(res, { results: await connectedAccountsService.searchGoogleYouTube(req.params.userId, String(req.query.q || ""), {
        type,
        maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
        pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
      }) });
    } catch (err) { next(err); }
  },

  async youtubeVideos(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { videos: await connectedAccountsService.getGoogleYouTubeVideos(req.params.userId, String(req.query.ids || "")) }); }
    catch (err) { next(err); }
  },
};
