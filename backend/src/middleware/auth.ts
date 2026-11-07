import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../config/database";
import { env } from "../config/env";
import { AuthenticatedUser, RoleCode } from "../types/auth.types";
import { AppError } from "../utils/AppError";

interface JwtPayload {
  userId: string;
  email: string;
  roleId: string;
  role: RoleCode;
  iat?: number;
  exp?: number;
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw AppError.unauthorized("Authentication required. Please provide a Bearer token.");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw AppError.unauthorized("Authentication token is missing.");
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, env.jwt.secret) as JwtPayload;
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        throw AppError.unauthorized("Access token has expired. Please refresh your token.", "TOKEN_EXPIRED");
      }
      throw AppError.unauthorized("Invalid access token.", "INVALID_TOKEN");
    }

    // Verify user exists, role is valid, and account is active
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.is_active,
              r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (userResult.rowCount === 0) {
      throw AppError.unauthorized("User account no longer exists.", "USER_NOT_FOUND");
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw AppError.forbidden("Your account has been deactivated. Please contact an administrator.", "ACCOUNT_DEACTIVATED");
    }

    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.role_id,
      role: user.role_code as RoleCode,
      roleName: user.role_name,
      firstName: user.first_name,
      lastName: user.last_name,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...allowedRoles: RoleCode[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized("Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Access forbidden: requires one of [${allowedRoles.join(", ")}], but your role is [${req.user.role}]`
        )
      );
    }

    next();
  };
};
