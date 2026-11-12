import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as contactService from '../services/contact.service';
import { createContactSchema, updateContactSchema } from '../validators/contact.validator';
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

export async function getCompanyContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const companyId = req.params.companyId || req.params.id;
    const parsedId = uuidParamSchema.safeParse(companyId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid company ID format', parsedId.error.flatten()));
    }
    const contacts = await contactService.getCompanyContacts(caller, parsedId.data);
    sendSuccess(res, { contacts }, 'Company contacts retrieved');
  } catch (err) {
    next(err);
  }
}

export async function createContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const companyId = req.params.companyId || req.params.id;
    const parsedId = uuidParamSchema.safeParse(companyId);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid company ID format', parsedId.error.flatten()));
    }
    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const contact = await contactService.createContact(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { contact }, 'Contact created', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid contact ID format', parsedId.error.flatten()));
    }
    const parsed = updateContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const contact = await contactService.updateContact(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { contact }, 'Contact updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid contact ID format', parsedId.error.flatten()));
    }
    await contactService.deleteContact(caller, parsedId.data, getIp(req), getUa(req));
    sendSuccess(res, null, 'Contact deleted');
  } catch (err) {
    next(err);
  }
}

export async function setPrimaryContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid contact ID format', parsedId.error.flatten()));
    }
    const contact = await contactService.setPrimaryContact(caller, parsedId.data, getIp(req), getUa(req));
    sendSuccess(res, { contact }, 'Primary contact updated');
  } catch (err) {
    next(err);
  }
}

