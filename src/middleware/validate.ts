import { NextFunction, Request, Response } from "express";
import { ZodError, ZodType } from "zod";
import { AppError } from "../utils/AppError";

/**
 * Validates req.body / req.query / req.params against a Zod schema.
 * Usage: router.post("/route", validate(schema), controller)
 */
export const validate =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as { body?: unknown };
      if (parsed.body !== undefined) req.body = parsed.body;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        return next(
          AppError.badRequest("Validation failed", "VALIDATION_ERROR", details)
        );
      }
      next(err);
    }
  };
