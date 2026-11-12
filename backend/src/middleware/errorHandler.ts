import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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

  if (err instanceof ZodError) {
    const rawIssues: any[] = (err as any).issues || (err as any).errors || [];
    const formattedErrors = rawIssues.map((e: any) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path ?? ''),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: formattedErrors,
      },
    });
    return;
  }

  if (err?.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Authentication token has expired',
      error: {
        code: 'TOKEN_EXPIRED',
        details: null,
      },
    });
    return;
  }

  if (err?.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid authentication token',
      error: {
        code: 'INVALID_TOKEN',
        details: null,
      },
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      message: 'Malformed JSON payload',
      error: {
        code: 'VALIDATION_ERROR',
        details: null,
      },
    });
    return;
  }

  // PostgreSQL unique violation
  if (err && typeof err === 'object' && (err as any).code === '23505') {
    const isCompanyDup = (err as any).constraint === 'uq_companies_name_lower';
    res.status(409).json({
      success: false,
      message: isCompanyDup
        ? 'A company with this name already exists'
        : 'A record with this identifier already exists',
      error: {
        code: isCompanyDup ? 'COMPANY_EXISTS' : 'EMAIL_ALREADY_EXISTS',
        details: null,
      },
    });
    return;
  }

  // PostgreSQL invalid input syntax (e.g. invalid UUID / enum / type representation)
  if (err && typeof err === 'object' && (err as any).code === '22P02') {
    res.status(400).json({
      success: false,
      message: 'Invalid input syntax or data representation',
      error: {
        code: 'VALIDATION_ERROR',
        details: null,
      },
    });
    return;
  }

  // PostgreSQL foreign key violation
  if (err && typeof err === 'object' && (err as any).code === '23503') {
    const constraint = String((err as any).constraint || '');
    const isAssignee = constraint.includes('assigned_to') || constraint.includes('assignee');
    res.status(400).json({
      success: false,
      message: isAssignee ? 'Invalid assignee' : 'Referenced entity does not exist',
      error: {
        code: isAssignee ? 'INVALID_ASSIGNEE' : 'VALIDATION_ERROR',
        details: null,
      },
    });
    return;
  }

  // PostgreSQL check constraint violation
  if (err && typeof err === 'object' && (err as any).code === '23514') {
    res.status(400).json({
      success: false,
      message: 'Input failed constraint validation check',
      error: {
        code: 'VALIDATION_ERROR',
        details: null,
      },
    });
    return;
  }

  // PostgreSQL numeric value out of range (e.g. smallint overflow)
  if (err && typeof err === 'object' && (err as any).code === '22003') {
    res.status(400).json({
      success: false,
      message: 'Value is out of range for the field type',
      error: {
        code: 'VALIDATION_ERROR',
        details: null,
      },
    });
    return;
  }

  // Internal error fallback - never leak stack traces or SQL details
  console.error('Unhandled internal error:', err?.message ?? err);
  res.status(500).json({
    success: false,
    message: 'An unexpected internal error occurred',
    error: {
      code: 'INTERNAL_ERROR',
      details: null,
    },
  });
};
