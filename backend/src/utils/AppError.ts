export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'TOKEN_REUSE_DETECTED'
  | 'INVALID_REFRESH_TOKEN'
  | 'ACCOUNT_DISABLED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCode = 'INTERNAL_ERROR',
    details: unknown = null,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static validationError(message = 'Validation failed', details: unknown = null) {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static invalidCredentials(message = 'Invalid email or password') {
    return new AppError(message, 401, 'INVALID_CREDENTIALS');
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static tokenExpired(message = 'Token has expired') {
    return new AppError(message, 401, 'TOKEN_EXPIRED');
  }

  static invalidToken(message = 'Invalid authentication token') {
    return new AppError(message, 401, 'INVALID_TOKEN');
  }

  static tokenReuseDetected(message = 'Refresh token reuse detected') {
    return new AppError(message, 401, 'TOKEN_REUSE_DETECTED');
  }

  static invalidRefreshToken(message = 'Invalid or expired refresh token') {
    return new AppError(message, 401, 'INVALID_REFRESH_TOKEN');
  }

  static accountDisabled(message = 'Account has been disabled') {
    return new AppError(message, 403, 'ACCOUNT_DISABLED');
  }

  static forbidden(message = 'Access forbidden') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static emailAlreadyExists(message = 'Email address already exists') {
    return new AppError(message, 409, 'EMAIL_ALREADY_EXISTS');
  }

  static rateLimited(message = 'Too many requests, please try again later') {
    return new AppError(message, 429, 'RATE_LIMITED');
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}
