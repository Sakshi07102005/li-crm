import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as followupController from '../controllers/followup.controller';

const router = Router();

const VIEW_PERMISSIONS = [
  'leads.view_all',
  'leads.view_team',
  'leads.view_own',
  'leads.view_marketing',
];

// List follow-ups
router.get(
  '/',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  followupController.listFollowups,
);

// Create follow-up
router.post(
  '/',
  authenticate,
  requirePermission('followups.manage'),
  followupController.createFollowup,
);

// Get single follow-up
router.get(
  '/:id',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  followupController.getFollowupById,
);

// Update follow-up
router.put(
  '/:id',
  authenticate,
  requirePermission('followups.manage'),
  followupController.updateFollowup,
);

// Change status
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('followups.manage'),
  followupController.changeFollowupStatus,
);

export { router as followupRoutes };

