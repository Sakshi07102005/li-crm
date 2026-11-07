import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface RequestValidationSchema {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validate = (schema: ZodSchema | RequestValidationSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if ("body" in schema || "query" in schema || "params" in schema) {
        const composite = schema as RequestValidationSchema;
        if (composite.body) {
          req.body = await composite.body.parseAsync(req.body);
        }
        if (composite.query) {
          req.query = (await composite.query.parseAsync(req.query)) as any;
        }
        if (composite.params) {
          req.params = (await composite.params.parseAsync(req.params)) as any;
        }
      } else {
        // Direct body schema
        req.body = await (schema as ZodSchema).parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
        return;
      }
      next(error);
    }
  };
};
