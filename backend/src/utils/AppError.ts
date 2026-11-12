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
  | 'CORS_NOT_ALLOWED'
  | 'DUPLICATE_LEAD'
  | 'INVALID_STATUS_TRANSITION'
  | 'LEAD_NOT_ASSIGNED'
  | 'LEAD_CLOSED'
  | 'INVALID_ASSIGNEE'
  | 'COMPANY_EXISTS'
  | 'INVALID_FOLLOWUP_STATE'
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

  static corsNotAllowed(message = 'CORS origin not allowed') {
    return new AppError(message, 403, 'CORS_NOT_ALLOWED');
  }

  static duplicateLead(message = 'Duplicate lead detected', details: unknown = null) {
    return new AppError(message, 409, 'DUPLICATE_LEAD', details);
  }

  static invalidStatusTransition(message = 'Invalid status transition', details: unknown = null) {
    return new AppError(message, 422, 'INVALID_STATUS_TRANSITION', details);
  }

  static leadNotAssigned(message = 'Lead must be assigned before converting', details: unknown = null) {
    return new AppError(message, 422, 'LEAD_NOT_ASSIGNED', details);
  }

  static leadClosed(message = 'Closed leads cannot be modified or assigned', details: unknown = null) {
    return new AppError(message, 422, 'LEAD_CLOSED', details);
  }

  static invalidAssignee(message = 'Invalid assignee', details: unknown = null) {
    return new AppError(message, 400, 'INVALID_ASSIGNEE', details);
  }

  static companyExists(message = 'A company with this name already exists', details: unknown = null) {
    return new AppError(message, 409, 'COMPANY_EXISTS', details);
  }

  static invalidFollowupState(message = 'Follow-up is not in a valid state for this action', details: unknown = null) {
    return new AppError(message, 422, 'INVALID_FOLLOWUP_STATE', details);
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}
