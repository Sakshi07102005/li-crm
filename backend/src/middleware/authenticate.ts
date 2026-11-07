import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { query } from '../db/pool';
import { AppError } from '../utils/AppError';

interface JwtPayload {
  sub: string;
  role?: string;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Authentication token is required'));
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(AppError.unauthorized('Authentication token is required'));
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.jwt.accessSecret) as JwtPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(AppError.tokenExpired('Authentication token has expired'));
    }
    return next(AppError.invalidToken('Invalid authentication token'));
  }

  try {
    const userRes = await query(
      `SELECT u.id, u.email, u.is_active, r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [decoded.sub],
    );

    if (userRes.rowCount === 0) {
      return next(AppError.unauthorized('User account does not exist'));
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      return next(AppError.accountDisabled('Account has been disabled'));
    }

    req.user = {
      id: user.id,
      email: user.email,
      roleCode: user.role_code,
      roleName: user.role_name,
    };

    next();
  } catch (err) {
    next(err);
  }
}

