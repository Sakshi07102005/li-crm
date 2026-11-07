import { Response } from "express";

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  meta?: Record<string, any>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Operation successful",
  statusCode = 200,
  meta?: Record<string, any>
): Response {
  const payload: ApiResponse<T> = {
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  };
  return res.status(statusCode).json(payload);
}

export function sendCreated<T>(
  res: Response,
  data: T,
  message = "Resource created successfully",
  meta?: Record<string, any>
): Response {
  return sendSuccess(res, data, message, 201, meta);
}

