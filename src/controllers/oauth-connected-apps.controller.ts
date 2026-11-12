import type { Request, Response, NextFunction } from "express";
import { prisma } from "../database/prisma";
import { oauthService } from "../services/oauth.service";
import { connectedAccountsService } from "../services/connectedAccounts.service";
import { AppError } from "../utils/AppError";
import { ok } from "../utils/response";

function bearer(req: Request): string {
  const header = req.header("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export const oauthConnectedAppsController = {

  async youTubeMusicSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await oauthService.introspect(bearer(req));
      if (!context.active || !context.user) {
        throw AppError.unauthorized("Invalid OAuth access token", "INVALID_TOKEN");
      }
      if (!context.scopes.includes("connected-apps:read")) {
        throw AppError.forbidden(
          "Searching connected music services requires the connected-apps:read permission.",
          "INSUFFICIENT_SCOPE"
        );
      }

      const results = await connectedAccountsService.searchYouTubeMusic(context.user.id, String(req.query.q || ""), {
        maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined,
        pageToken: typeof req.query.pageToken === "string" ? req.query.pageToken : undefined,
      });
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { results });
    } catch (error) {
      next(error);
    }
  },

  async youTubeCreatorResearch(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await oauthService.introspect(bearer(req));
      if (!context.active || !context.user) {
        throw AppError.unauthorized("Invalid OAuth access token", "INVALID_TOKEN");
      }
      if (!context.scopes.includes("connected-apps:read")) {
        throw AppError.forbidden(
          "YouTube creator research requires the connected-apps:read permission.",
          "INSUFFICIENT_SCOPE"
        );
      }

      const result = await connectedAccountsService.researchYouTubeCreator(
        context.user.id,
        String(req.query.q || ""),
        { maxResults: typeof req.query.maxResults === "string" ? Number(req.query.maxResults) : undefined },
      );
      res.setHeader("Cache-Control", "no-store");
      return ok(res, result);
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const context = await oauthService.introspect(bearer(req));
      if (!context.active || !context.user) {
        throw AppError.unauthorized("Invalid OAuth access token", "INVALID_TOKEN");
      }
      if (!context.scopes.includes("connected-apps:read")) {
        throw AppError.forbidden(
          "Reading connected apps requires the connected-apps:read permission.",
          "INSUFFICIENT_SCOPE"
        );
      }

      const accounts = await prisma.connectedAccount.findMany({
        where: { userId: context.user.id },
        select: {
          provider: true,
          scope: true,
          linkedAt: true,
          updatedAt: true,
          tokenExpiresAt: true
        },
        orderBy: { provider: "asc" }
      });

      res.setHeader("Cache-Control", "no-store");
      return ok(res, {
        accounts: accounts.map((account) => ({
          provider: account.provider,
          connected: true,
          scopes: (account.scope || "").split(/\\s+/).filter(Boolean),
          linkedAt: account.linkedAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
          tokenExpiresAt: account.tokenExpiresAt?.toISOString() || null
        }))
      });
    } catch (error) {
      next(error);
    }
  }
};
