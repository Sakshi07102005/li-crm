import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { sendCreated, sendSuccess } from "../utils/response";

export class AuthController {
  public static async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await AuthService.register(req.body);
      sendCreated(res, result, "Account registered successfully");
    } catch (error) {
      next(error);
    }
  }

  public static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await AuthService.login(req.body);
      sendSuccess(res, result, "Login successful");
    } catch (error) {
      next(error);
    }
  }

  public static async refreshToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refreshToken(refreshToken);
      sendSuccess(res, result, "Token refreshed successfully");
    } catch (error) {
      next(error);
    }
  }

  public static async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;
      await AuthService.logout(refreshToken);
      sendSuccess(res, null, "Logged out successfully");
    } catch (error) {
      next(error);
    }
  }

  public static async getMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const profile = await AuthService.getProfile(req.user!.id);
      sendSuccess(res, profile, "User profile retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  public static async updateMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const updated = await AuthService.updateProfile(req.user!.id, req.body);
      sendSuccess(res, updated, "Profile updated successfully");
    } catch (error) {
      next(error);
    }
  }

  public static async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await AuthService.changePassword(req.user!.id, req.body);
      sendSuccess(
        res,
        null,
        "Password changed successfully. Existing sessions have been revoked."
      );
    } catch (error) {
      next(error);
    }
  }
}

