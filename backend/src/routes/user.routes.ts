import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as userController from '../controllers/user.controller';

const router = Router();

// List users — users.manage OR users.view_team
router.get(
  '/',
  authenticate,
  requirePermission('users.manage', 'users.view_team'),
  userController.listUsers,
);

// Get single user — users.manage OR users.view_team
router.get(
  '/:id',
  authenticate,
  requirePermission('users.manage', 'users.view_team'),
  userController.getUserById,
);

// Create user — users.manage only
router.post('/', authenticate, requirePermission('users.manage'), userController.createUser);

// Update user profile fields — users.manage only
router.put('/:id', authenticate, requirePermission('users.manage'), userController.updateUser);

// Change user role — users.manage only
router.patch(
  '/:id/role',
  authenticate,
  requirePermission('users.manage'),
  userController.changeUserRole,
);

// Change user active status — users.manage only
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('users.manage'),
  userController.changeUserStatus,
);

// Reset user password — users.manage only
router.post(
  '/:id/reset-password',
  authenticate,
  requirePermission('users.manage'),
  userController.resetUserPassword,
);

export { router as userRoutes };

