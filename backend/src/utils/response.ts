import { Response } from 'express';
import { ErrorCode } from './AppError';

export interface SuccessEnvelope<T = any> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  message: string;
  error: {
    code: ErrorCode | string;
    details: unknown;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Operation successful',
  statusCode = 200,
): Response {
  const payload: SuccessEnvelope<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  code: ErrorCode | string = 'INTERNAL_ERROR',
  details: unknown = null,
): Response {
  const payload: ErrorEnvelope = {
    success: false,
    message,
    error: {
      code,
      details: details ?? null,
    },
  };
  return res.status(statusCode).json(payload);
}
