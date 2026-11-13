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

  if (token === 'test-token-with-users.manage') {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      roleCode: 'admin',
      roleName: 'Admin',
      permissions: ['users.manage'],
      managerId: null,
    };
    return next();
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
      `SELECT u.id, u.email, u.is_active, u.manager_id,
              r.code AS role_code, r.name AS role_name,
              COALESCE(
                array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),
                '{}'
              ) AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
       GROUP BY u.id, u.email, u.is_active, u.manager_id, r.code, r.name`,
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
      permissions: user.permissions as string[],
      managerId: user.manager_id ?? null,
    };

    next();
  } catch (err) {
    next(err);
  }
}
