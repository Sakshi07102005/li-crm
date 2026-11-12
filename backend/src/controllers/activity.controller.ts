import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as activityService from '../services/activity.service';
import {
  createActivitySchema,
  listActivitiesQuerySchema,
} from '../validators/activity.validator';
import { uuidParamSchema } from '../validators/lead.validator';

function getIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const val = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return val.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? null;
}

function getUa(req: Request): string | null {
  return (req.headers['user-agent'] as string) ?? null;
}

export async function createActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const activity = await activityService.createActivity(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { activity }, 'Activity recorded', 201);
  } catch (err) {
    next(err);
  }
}

export async function listLeadActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const parsedQuery = listActivitiesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return next(AppError.validationError('Invalid query parameters', parsedQuery.error.flatten()));
    }
    const result = await activityService.listLeadActivities(caller, parsedId.data, parsedQuery.data);
    sendSuccess(res, result, 'Lead activities retrieved');
  } catch (err) {
    next(err);
  }
}

