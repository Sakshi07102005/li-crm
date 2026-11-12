import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as leadService from '../services/lead.service';
import {
  uuidParamSchema,
  createLeadSchema,
  updateLeadSchema,
  checkDuplicateSchema,
  changeStatusSchema,
  assignLeadSchema,
  listLeadsQuerySchema,
} from '../validators/lead.validator';

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

function getParamId(req: Request, paramName = 'id'): string {
  const id = req.params[paramName];
  return Array.isArray(id) ? id[0] : id;
}

export async function getLookups(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const result = await leadService.getLookups(caller);
    sendSuccess(res, result, 'Lead lookups retrieved');
  } catch (err) {
    next(err);
  }
}

export async function checkDuplicate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = checkDuplicateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const result = await leadService.checkDuplicate(caller, parsed.data);
    sendSuccess(res, result, 'Duplicate check completed');
  } catch (err) {
    next(err);
  }
}

export async function listLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = listLeadsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid query parameters', parsed.error.flatten()));
    }
    const result = await leadService.listLeads(caller, parsed.data);
    sendSuccess(res, result, 'Leads retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getLeadById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const rawId = getParamId(req);
    const parsedId = uuidParamSchema.safeParse(rawId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const lead = await leadService.getLeadById(caller, parsedId.data);
    sendSuccess(res, { lead }, 'Lead retrieved');
  } catch (err) {
    next(err);
  }
}

export async function createLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const lead = await leadService.createLead(caller, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { lead }, 'Lead created', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const rawId = getParamId(req);
    const parsedId = uuidParamSchema.safeParse(rawId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const parsedBody = updateLeadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return next(AppError.validationError('Invalid input', parsedBody.error.flatten()));
    }
    const lead = await leadService.updateLead(caller, parsedId.data, parsedBody.data, getIp(req), getUa(req));
    sendSuccess(res, { lead }, 'Lead updated');
  } catch (err) {
    next(err);
  }
}

export async function changeLeadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const rawId = getParamId(req);
    const parsedId = uuidParamSchema.safeParse(rawId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const parsedBody = changeStatusSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return next(AppError.validationError('Invalid input', parsedBody.error.flatten()));
    }
    const lead = await leadService.changeLeadStatus(caller, parsedId.data, parsedBody.data, getIp(req), getUa(req));
    sendSuccess(res, { lead }, 'Lead status updated');
  } catch (err) {
    next(err);
  }
}

export async function assignLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const rawId = getParamId(req);
    const parsedId = uuidParamSchema.safeParse(rawId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const parsedBody = assignLeadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return next(AppError.validationError('Invalid input', parsedBody.error.flatten()));
    }
    const lead = await leadService.assignLead(caller, parsedId.data, parsedBody.data, getIp(req), getUa(req));
    sendSuccess(res, { lead }, 'Lead assigned');
  } catch (err) {
    next(err);
  }
}

export async function getLeadAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const rawId = getParamId(req);
    const parsedId = uuidParamSchema.safeParse(rawId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    const assignments = await leadService.getLeadAssignments(caller, parsedId.data);
    sendSuccess(res, { assignments }, 'Lead assignment history retrieved');
  } catch (err) {
    next(err);
  }
}

export async function deleteLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const rawId = getParamId(req);
    const parsedId = uuidParamSchema.safeParse(rawId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid lead ID format', parsedId.error.flatten()));
    }
    await leadService.deleteLead(caller, parsedId.data, getIp(req), getUa(req));
    sendSuccess(res, null, 'Lead deleted');
  } catch (err) {
    next(err);
  }
}

