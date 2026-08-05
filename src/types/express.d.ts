import { AccessTokenPayload } from "../security/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      requestId?: string;
    }
  }
}

export {};
