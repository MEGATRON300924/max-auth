import { Request, Response, NextFunction } from "express";
import { auditService } from "../services/audit.service";
import { usageService } from "../services/usage.service";
import { generateCsrfToken } from "../middleware/csrf";
import { ok } from "../utils/response";

export const securityController = {
  async auditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await auditService.listForUser(req.user!.sub);
      return ok(res, { logs });
    } catch (err) {
      next(err);
    }
  },

  async usage(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await usageService.summary(req.user!.sub);
      return ok(res, summary);
    } catch (err) {
      next(err);
    }
  },

  csrfToken(req: Request, res: Response) {
    const token = generateCsrfToken(req, res);
    return ok(res, { csrfToken: token });
  },
};
