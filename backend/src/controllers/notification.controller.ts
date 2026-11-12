import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as notifService from '../services/notification.service';

export async function listNotifications(req: Request, res: Response) {
  const user = req.user!;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';

  const data = await notifService.listNotifications(user.id, { page, limit, unreadOnly });
  return sendSuccess(res, data);
}

export async function getUnreadCount(req: Request, res: Response) {
  const count = await notifService.getUnreadCount(req.user!.id);
  return sendSuccess(res, { unreadCount: count });
}

export async function markAsRead(req: Request, res: Response) {
  const notifId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const notif = await notifService.markAsRead(req.user!.id, notifId);
  return sendSuccess(res, notif, 'Notification marked as read');
}

export async function markAllAsRead(req: Request, res: Response) {
  const result = await notifService.markAllAsRead(req.user!.id);
  return sendSuccess(res, result, 'All notifications marked as read');
}

export async function registerDeviceToken(req: Request, res: Response) {
  const { token, platform } = req.body;
  if (!token || typeof token !== 'string') {
    throw AppError.validationError('Valid token string is required');
  }
  if (!platform || !['android', 'ios', 'web'].includes(platform)) {
    throw AppError.validationError('Platform must be android, ios, or web');
  }

  await notifService.registerDeviceToken(req.user!.id, token, platform);
  return sendSuccess(res, { token, platform }, 'Device token registered');
}

export async function deleteDeviceToken(req: Request, res: Response) {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    throw AppError.validationError('Token string is required');
  }

  await notifService.deleteDeviceToken(req.user!.id, token);
  return sendSuccess(res, null, 'Device token removed');
}
