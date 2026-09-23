import { Request, Response, NextFunction } from "express";
import { connectedAccountsService } from "../services/connectedAccounts.service";
import { ok } from "../utils/response";

export const internalSpotifyController = {
  async me(req: Request, res: Response, next: NextFunction) { try { return ok(res, { profile: await connectedAccountsService.spotifyMe(req.params.userId) }); } catch (err) { next(err); } },
  async topArtists(req: Request, res: Response, next: NextFunction) { try { return ok(res, { artists: await connectedAccountsService.spotifyTopArtists(req.params.userId, { timeRange: req.query.timeRange as any, limit: Number(req.query.limit) || 20, offset: Number(req.query.offset) || 0 }) }); } catch (err) { next(err); } },
  async topTracks(req: Request, res: Response, next: NextFunction) { try { return ok(res, { tracks: await connectedAccountsService.spotifyTopTracks(req.params.userId, { timeRange: req.query.timeRange as any, limit: Number(req.query.limit) || 20, offset: Number(req.query.offset) || 0 }) }); } catch (err) { next(err); } },
  async recentlyPlayed(req: Request, res: Response, next: NextFunction) { try { return ok(res, { playback: await connectedAccountsService.spotifyRecentlyPlayed(req.params.userId, Number(req.query.limit) || 20) }); } catch (err) { next(err); } },
  async currentlyPlaying(req: Request, res: Response, next: NextFunction) { try { return ok(res, { playback: await connectedAccountsService.spotifyCurrentlyPlaying(req.params.userId) }); } catch (err) { next(err); } },
  async play(req: Request, res: Response, next: NextFunction) { try { return ok(res, { result: await connectedAccountsService.spotifyPlay(req.params.userId, req.body) }); } catch (err) { next(err); } },
  async pause(req: Request, res: Response, next: NextFunction) { try { return ok(res, { result: await connectedAccountsService.spotifyPause(req.params.userId) }); } catch (err) { next(err); } },
  async next(req: Request, res: Response, next: NextFunction) { try { return ok(res, { result: await connectedAccountsService.spotifyNext(req.params.userId) }); } catch (err) { next(err); } },
  async previous(req: Request, res: Response, next: NextFunction) { try { return ok(res, { result: await connectedAccountsService.spotifyPrevious(req.params.userId) }); } catch (err) { next(err); } },
};
