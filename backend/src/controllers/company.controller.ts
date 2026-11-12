import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as companyService from '../services/company.service';
import {
  createCompanySchema,
  updateCompanySchema,
  listCompaniesQuerySchema,
} from '../validators/company.validator';
import { uuidParamSchema, listLeadsQuerySchema } from '../validators/lead.validator';

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

export async function listCompanies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = listCompaniesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid query parameters', parsed.error.flatten()));
    }
    const result = await companyService.listCompanies(caller, parsed.data);
    sendSuccess(res, result, 'Companies retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getCompanyById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid company ID format', parsedId.error.flatten()));
    }
    const company = await companyService.getCompanyById(caller, parsedId.data);
    sendSuccess(res, { company }, 'Company retrieved');
  } catch (err) {
    next(err);
  }
}

export async function createCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const company = await companyService.createCompany(caller, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { company }, 'Company created', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid company ID format', parsedId.error.flatten()));
    }
    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const company = await companyService.updateCompany(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { company }, 'Company updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid company ID format', parsedId.error.flatten()));
    }
    await companyService.deleteCompany(caller, parsedId.data, getIp(req), getUa(req));
    sendSuccess(res, null, 'Company deleted');
  } catch (err) {
    next(err);
  }
}

export async function getCompanyLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid company ID format', parsedId.error.flatten()));
    }
    const parsedQuery = listLeadsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return next(AppError.validationError('Invalid query parameters', parsedQuery.error.flatten()));
    }
    const result = await companyService.getCompanyLeads(caller, parsedId.data, parsedQuery.data);
    sendSuccess(res, result, 'Company leads retrieved');
  } catch (err) {
    next(err);
  }
}

