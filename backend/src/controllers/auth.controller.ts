import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { sendSuccess } from '../utils/response';

function getClientDetails(req: Request) {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    req.ip;
  const userAgent = req.headers['user-agent'] || undefined;
  return { ip, userAgent };
}

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ip, userAgent } = getClientDetails(req);
      const result = await AuthService.register(req.body, ip, userAgent);
      sendSuccess(res, result, 'User registered successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ip, userAgent } = getClientDetails(req);
      const result = await AuthService.login(req.body, ip, userAgent);
      sendSuccess(res, result, 'Login successful', 200);
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ip, userAgent } = getClientDetails(req);
      const tokens = await AuthService.refreshToken(req.body.refreshToken, ip, userAgent);
      sendSuccess(res, tokens, 'Token refreshed successfully', 200);
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ip, userAgent } = getClientDetails(req);
      await AuthService.logout(req.body.refreshToken, ip, userAgent);
      sendSuccess(res, null, 'Logged out successfully', 200);
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const profile = await AuthService.getMe(userId);
      sendSuccess(res, profile, 'User profile retrieved successfully', 200);
    } catch (err) {
      next(err);
    }
  }

  static async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { ip, userAgent } = getClientDetails(req);
      const updated = await AuthService.updateMe(userId, req.body, ip, userAgent);
      sendSuccess(res, updated, 'Profile updated successfully', 200);
    } catch (err) {
      next(err);
    }
  }

  static async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { ip, userAgent } = getClientDetails(req);
      await AuthService.changePassword(userId, req.body, ip, userAgent);
      sendSuccess(res, null, 'Password changed successfully', 200);
    } catch (err) {
      next(err);
    }
  }
}
