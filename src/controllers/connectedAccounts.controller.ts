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
