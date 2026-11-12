import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../services/audit.service';

function getIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? null;
}

/**
 * Middleware: user must have AT LEAST ONE of the listed permission codes.
 */
export function requirePermission(...codes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    const hasPermission = codes.some((code) => user.permissions.includes(code));
    if (hasPermission) {
      return next();
    }

    // Write audit log for denied access
    await writeAuditLog({
      userId: user.id,
      action: 'authz.denied',
      entityType: 'endpoint',
      entityId: `${req.method} ${req.path}`,
      newValues: { requiredPermissions: codes, method: req.method, path: req.path },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    }).catch(() => {
      /* non-fatal */
    });

    next(AppError.forbidden('You do not have permission to access this resource'));
  };
}

/**
 * Middleware: user must have ALL of the listed permission codes.
 */
export function requireAllPermissions(...codes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    const hasAll = codes.every((code) => user.permissions.includes(code));
    if (hasAll) {
      return next();
    }

    await writeAuditLog({
      userId: user.id,
      action: 'authz.denied',
      entityType: 'endpoint',
      entityId: `${req.method} ${req.path}`,
      newValues: {
        requiredPermissions: codes,
        missingPermissions: codes.filter((c) => !user.permissions.includes(c)),
        method: req.method,
        path: req.path,
      },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    }).catch(() => {
      /* non-fatal */
    });

    next(AppError.forbidden('You do not have permission to access this resource'));
  };
}

/**
 * Middleware: user must have one of the listed role codes.
 */
export function requireRole(...roleCodes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (roleCodes.includes(user.roleCode)) {
      return next();
    }

    await writeAuditLog({
      userId: user.id,
      action: 'authz.denied',
      entityType: 'endpoint',
      entityId: `${req.method} ${req.path}`,
      newValues: { requiredRoles: roleCodes, method: req.method, path: req.path },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    }).catch(() => {
      /* non-fatal */
    });

    next(AppError.forbidden('You do not have permission to access this resource'));
  };
}

