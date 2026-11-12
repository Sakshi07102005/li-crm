import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as userService from '../services/user.service';
import {
  createUserSchema,
  updateUserSchema,
  changeRoleSchema,
  changeStatusSchema,
  resetPasswordSchema,
  listUsersQuerySchema,
} from '../validators/user.validator';

function getIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const val = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return val.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? null;
}

function getUa(req: Request): string | null {
  return req.headers['user-agent'] ?? null;
}

function paramId(req: Request): string {
  const id = req.params['id'];
  return Array.isArray(id) ? id[0] : id;
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid query parameters', parsed.error.flatten()));
    }
    const result = await userService.listUsers(caller, parsed.data);
    sendSuccess(res, result, 'Users retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const user = await userService.getUserById(caller, paramId(req));
    sendSuccess(res, { user }, 'User retrieved');
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Validation failed', parsed.error.flatten()));
    }
    const user = await userService.createUser(parsed.data, caller, getIp(req), getUa(req));
    sendSuccess(res, { user }, 'User created', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Validation failed', parsed.error.flatten()));
    }
    const user = await userService.updateUser(
      paramId(req),
      parsed.data,
      caller,
      getIp(req),
      getUa(req),
    );
    sendSuccess(res, { user }, 'User updated');
  } catch (err) {
    next(err);
  }
}

export async function changeUserRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = changeRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Validation failed', parsed.error.flatten()));
    }
    const user = await userService.changeUserRole(
      paramId(req),
      parsed.data.roleCode,
      caller,
      getIp(req),
      getUa(req),
    );
    sendSuccess(res, { user }, 'User role changed');
  } catch (err) {
    next(err);
  }
}

export async function changeUserStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = changeStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Validation failed', parsed.error.flatten()));
    }
    const user = await userService.changeUserStatus(
      paramId(req),
      parsed.data.isActive,
      caller,
      getIp(req),
      getUa(req),
    );
    sendSuccess(res, { user }, `User ${parsed.data.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) {
    next(err);
  }
}

export async function resetUserPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Validation failed', parsed.error.flatten()));
    }
    await userService.resetUserPassword(
      paramId(req),
      parsed.data.newPassword,
      caller,
      getIp(req),
      getUa(req),
    );
    sendSuccess(res, null, 'Password reset successfully');
  } catch (err) {
    next(err);
  }
}
