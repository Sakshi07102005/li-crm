import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { query } from '../db/pool';
import { sendSuccess } from '../utils/response';
import { leadScope } from '../services/scope.service';

const router = Router();

/** GET /api/roles — any authenticated user */
router.get('/roles', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM roles ORDER BY id`,
    );
    sendSuccess(res, { roles: result.rows }, 'Roles retrieved');
  } catch (err) {
    next(err);
  }
});

/** GET /api/rbac/permissions — returns current user's permissions + scope */
router.get(
  '/rbac/permissions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;

      // Determine lead scope label
      const scope = leadScope(user);
      let leadScopeLabel: string;
      if (user.permissions.includes('leads.view_all')) {
        leadScopeLabel = 'all';
      } else if (user.permissions.includes('leads.view_team')) {
        leadScopeLabel = 'team';
      } else if (user.permissions.includes('leads.view_own')) {
        leadScopeLabel = 'own';
      } else if (user.permissions.includes('leads.view_marketing')) {
        leadScopeLabel = 'marketing';
      } else {
        leadScopeLabel = 'none';
      }

      sendSuccess(
        res,
        {
          role: { code: user.roleCode, name: user.roleName },
          permissions: user.permissions,
          scope: { leads: leadScopeLabel },
        },
        'Permissions retrieved',
      );
    } catch (err) {
      next(err);
    }
  },
);

export { router as rbacRoutes };

