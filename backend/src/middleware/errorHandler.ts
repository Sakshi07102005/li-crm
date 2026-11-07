import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Operational AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.code,
        details: err.details ?? null,
      },
    });
    return;
  }

  // Zod validation errors (supports Zod v3 .errors and Zod v4 .issues)
  if (err instanceof ZodError) {
    const rawIssues: any[] = (err as any).issues || (err as any).errors || [];
    const formattedErrors = rawIssues.map((e: any) => ({
      field: Array.isArray(e.path) ? e.path.join(".") : String(e.path ?? ""),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      message: "Validation error on incoming request",
      error: {
        code: "VALIDATION_ERROR",
        details: formattedErrors,
      },
    });
    return;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    res.status(401).json({
      success: false,
      message: "Invalid or malformed authentication token",
      error: {
        code: "INVALID_TOKEN",
        details: null,
      },
    });
    return;
  }

  if (err.name === "TokenExpiredError") {
    res.status(401).json({
      success: false,
      message: "Authentication token has expired. Please refresh your token.",
      error: {
        code: "TOKEN_EXPIRED",
        details: null,
      },
    });
    return;
  }

  // Malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
      error: {
        code: "INVALID_JSON",
        details: null,
      },
    });
    return;
  }

  // PostgreSQL unique violation error (code 23505)
  if (err && typeof err === "object" && (err as any).code === "23505") {
    res.status(409).json({
      success: false,
      message: "A record with this unique identifier already exists",
      error: {
        code: "DUPLICATE_ENTRY",
        details: (err as any).detail ?? null,
      },
    });
    return;
  }

  // Unexpected internal server error
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    message: "An unexpected error occurred on the server",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      details: env.isProduction ? null : String(err?.message ?? err),
    },
  });
};
