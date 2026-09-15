import { NextFunction, Request, Response } from "express";
import { webhookService } from "../services/webhook.service";
import { AppError } from "../utils/AppError";

function userId(req: Request) {
  const id = req.user?.sub;
  if (!id) throw AppError.unauthorized("Authentication required");
  return id;
}

export const webhookController = {
  events(_req: Request, res: Response) {
    return res.json({ events: webhookService.events });
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try { return res.json({ webhooks: await webhookService.list(userId(req)) }); } catch (error) { return next(error); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, url, events } = req.body ?? {};
      if (typeof name !== "string" || typeof url !== "string" || !Array.isArray(events)) throw AppError.badRequest("name, url and events are required");
      return res.status(201).json(await webhookService.create(userId(req), name, url, events));
    } catch (error) { return next(error); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try { return res.json(await webhookService.update(userId(req), req.params.endpointId, req.body ?? {})); } catch (error) { return next(error); }
  },

  async rotateSecret(req: Request, res: Response, next: NextFunction) {
    try { return res.json(await webhookService.rotateSecret(userId(req), req.params.endpointId)); } catch (error) { return next(error); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try { await webhookService.remove(userId(req), req.params.endpointId); return res.status(204).send(); } catch (error) { return next(error); }
  },

  async deliveries(req: Request, res: Response, next: NextFunction) {
    try { return res.json({ deliveries: await webhookService.deliveries(userId(req), req.params.endpointId) }); } catch (error) { return next(error); }
  },

  async test(req: Request, res: Response, next: NextFunction) {
    try {
      const endpoint = (await webhookService.list(userId(req))).find((item) => item.id === req.params.endpointId);
      if (!endpoint) throw AppError.notFound("Webhook endpoint not found");
      const result = await webhookService.deliver(req.params.endpointId, "webhook.test", { message: "This is a test event from MAX Developers." });
      return res.json(result);
    } catch (error) { return next(error); }
  },
};
