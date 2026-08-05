import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { AppError } from "../utils/AppError";

/**
 * Validates req.body / req.query / req.params against a Zod schema.
 * Usage: router.post("/route", validate(schema), controller)
 */
export const validate =
  (schema: AnyZodObject) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body) req.body = parsed.body;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        }));
        return next(
          AppError.badRequest("Validation failed", "VALIDATION_ERROR", details)
        );
      }
      next(err);
    }
  };
