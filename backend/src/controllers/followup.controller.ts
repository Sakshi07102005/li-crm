import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as followupService from '../services/followup.service';
import {
  createFollowupSchema,
  updateFollowupSchema,
  changeFollowupStatusSchema,
  listFollowupsQuerySchema,
} from '../validators/followup.validator';
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

export async function createFollowup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = createFollowupSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const followup = await followupService.createFollowup(caller, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { followup }, 'Follow-up created', 201);
  } catch (err) {
    next(err);
  }
}

export async function listFollowups(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = listFollowupsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid query parameters', parsed.error.flatten()));
    }
    const result = await followupService.listFollowups(caller, parsed.data);
    sendSuccess(res, result, 'Follow-ups retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getFollowupById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid follow-up ID format', parsedId.error.flatten()));
    }
    const followup = await followupService.getFollowupById(caller, parsedId.data);
    sendSuccess(res, { followup }, 'Follow-up retrieved');
  } catch (err) {
    next(err);
  }
}

export async function updateFollowup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid follow-up ID format', parsedId.error.flatten()));
    }
    const parsed = updateFollowupSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const followup = await followupService.updateFollowup(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { followup }, 'Follow-up updated');
  } catch (err) {
    next(err);
  }
}

export async function changeFollowupStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid follow-up ID format', parsedId.error.flatten()));
    }
    const parsed = changeFollowupStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const result = await followupService.changeFollowupStatus(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, result, 'Follow-up status updated');
  } catch (err) {
    next(err);
  }
}

