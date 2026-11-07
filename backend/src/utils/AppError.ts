export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request", code = "BAD_REQUEST", details?: unknown) {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED", details?: unknown) {
    return new AppError(message, 401, code, details);
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN", details?: unknown) {
    return new AppError(message, 403, code, details);
  }

  static notFound(message = "Resource not found", code = "NOT_FOUND", details?: unknown) {
    return new AppError(message, 404, code, details);
  }

  static conflict(message = "Conflict detected", code = "CONFLICT", details?: unknown) {
    return new AppError(message, 409, code, details);
  }

  static unprocessable(message = "Validation failed", details?: unknown) {
    return new AppError(message, 422, "VALIDATION_ERROR", details);
  }
}
