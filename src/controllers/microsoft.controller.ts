import { Request, Response, NextFunction } from "express";
import { microsoftService } from "../services/microsoft.service";
import { env } from "../config/env";
import { ok } from "../utils/response";

export const microsoftController = {
  async connect(req: Request, res: Response, next: NextFunction) {
    try {
      const authorizationUrl = await microsoftService.createAuthorizationUrl(req.user!.sub);
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { authorizationUrl });
    } catch (err) { next(err); }
  },

  async callback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await microsoftService.handleCallback({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        error_description: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
      }, req);
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + `/connected-apps?microsoft=${result.status}`);
    } catch (err) {
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(env.FRONTEND_URL + "/connected-apps?microsoft=error");
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { profile: await microsoftService.me(req.user!.sub) }); } catch (err) { next(err); }
  },

  async mail(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, { messages: await microsoftService.mail(req.user!.sub, {
        top: typeof req.query.top === "string" ? Number(req.query.top) : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      }) });
    } catch (err) { next(err); }
  },

  async calendarEvents(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, { events: await microsoftService.calendarEvents(req.user!.sub, {
        startDateTime: typeof req.query.startDateTime === "string" ? req.query.startDateTime : undefined,
        endDateTime: typeof req.query.endDateTime === "string" ? req.query.endDateTime : undefined,
        top: typeof req.query.top === "string" ? Number(req.query.top) : undefined,
      }) });
    } catch (err) { next(err); }
  },

  async driveFiles(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { files: await microsoftService.driveFiles(req.user!.sub, { top: typeof req.query.top === "string" ? Number(req.query.top) : undefined }) }); } catch (err) { next(err); }
  },

  async todoLists(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { lists: await microsoftService.todoLists(req.user!.sub) }); } catch (err) { next(err); }
  },

  async todoTasks(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { tasks: await microsoftService.todoTasks(req.user!.sub, String(req.query.listId || "")) }); } catch (err) { next(err); }
  },

  async contacts(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { contacts: await microsoftService.contacts(req.user!.sub, { top: typeof req.query.top === "string" ? Number(req.query.top) : undefined }) }); } catch (err) { next(err); }
  },

  async sendMail(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, { result: await microsoftService.sendMail(req.user!.sub, req.body?.message || {}) }); } catch (err) { next(err); }
  },
};
