import { Request, Response, NextFunction } from "express";
import { connectedAccountsService } from "../services/connectedAccounts.service";
import { getRequestContext } from "../utils/requestContext";
import { ok } from "../utils/response";

export const connectedAccountsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const accounts = await connectedAccountsService.list(req.user!.sub);
      return ok(res, { accounts });
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
