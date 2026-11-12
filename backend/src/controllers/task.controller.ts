import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as taskService from '../services/task.service';
import {
  createTaskSchema,
  updateTaskSchema,
  changeTaskStatusSchema,
  listTasksQuerySchema,
} from '../validators/task.validator';
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

export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const task = await taskService.createTask(caller, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { task }, 'Task created', 201);
  } catch (err) {
    next(err);
  }
}

export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsed = listTasksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid query parameters', parsed.error.flatten()));
    }
    const result = await taskService.listTasks(caller, parsed.data);
    sendSuccess(res, result, 'Tasks retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid task ID format', parsedId.error.flatten()));
    }
    const task = await taskService.getTaskById(caller, parsedId.data);
    sendSuccess(res, { task }, 'Task retrieved');
  } catch (err) {
    next(err);
  }
}

export async function updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid task ID format', parsedId.error.flatten()));
    }
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const task = await taskService.updateTask(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { task }, 'Task updated');
  } catch (err) {
    next(err);
  }
}

export async function changeTaskStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid task ID format', parsedId.error.flatten()));
    }
    const parsed = changeTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.validationError('Invalid input', parsed.error.flatten()));
    }
    const task = await taskService.changeTaskStatus(caller, parsedId.data, parsed.data, getIp(req), getUa(req));
    sendSuccess(res, { task }, 'Task status updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = req.user!;
    const parsedId = uuidParamSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return next(AppError.validationError('Invalid task ID format', parsedId.error.flatten()));
    }
    await taskService.deleteTask(caller, parsedId.data, getIp(req), getUa(req));
    sendSuccess(res, null, 'Task deleted');
  } catch (err) {
    next(err);
  }
}

