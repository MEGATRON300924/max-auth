import { Request, Response, NextFunction } from "express";
import { deviceService } from "../services/device.service";
import { auditService } from "../services/audit.service";
import { ok } from "../utils/response";
import { getRequestContext } from "../utils/requestContext";

export const deviceController = {
  async listDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const devices = await deviceService.listDevices(req.user!.sub);
      return ok(res, { devices });
    } catch (err) {
      next(err);
    }
  },

  async trustDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const device = await deviceService.trustDevice(req.user!.sub, req.params.deviceId);
      await auditService.record("DEVICE_TRUSTED", {
        userId: req.user!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return ok(res, { device });
    } catch (err) {
      next(err);
    }
  },

  async revokeDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await deviceService.revokeDevice(req.user!.sub, req.params.deviceId);
      await auditService.record("DEVICE_REVOKED", {
        userId: req.user!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return ok(res, { message: "Device revoked" });
    } catch (err) {
      next(err);
    }
  },

  async listSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const sessions = await deviceService.listSessions(req.user!.sub);
      return ok(res, { sessions });
    } catch (err) {
      next(err);
    }
  },

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await deviceService.revokeSession(req.user!.sub, req.params.sessionId);
      await auditService.record("SESSION_REVOKED", {
        userId: req.user!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return ok(res, { message: "Session revoked" });
    } catch (err) {
      next(err);
    }
  },

  async revokeAllSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      await deviceService.revokeAllSessions(req.user!.sub);
      await auditService.record("SESSION_REVOKED", {
        userId: req.user!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { scope: "all" },
      });
      return ok(res, { message: "All sessions revoked" });
    } catch (err) {
      next(err);
    }
  },

  async loginHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await auditService.listLoginHistoryForUser(req.user!.sub);
      return ok(res, { history });
    } catch (err) {
      next(err);
    }
  },
};
