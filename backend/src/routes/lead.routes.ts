import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as leadController from '../controllers/lead.controller';
import * as activityController from '../controllers/activity.controller';

const router = Router();

const VIEW_PERMISSIONS = [
  'leads.view_all',
  'leads.view_team',
  'leads.view_own',
  'leads.view_marketing',
];

// 1. Lookups: statuses, products, sources, assignable users
router.get(
  '/lookups',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.getLookups,
);

// 2. Pre-flight duplicate check
router.post(
  '/check-duplicate',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.checkDuplicate,
);

// 3. List leads with filters, pagination, sorting
router.get(
  '/',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.listLeads,
);

// 4. Create lead
router.post(
  '/',
  authenticate,
  requirePermission('leads.create'),
  leadController.createLead,
);

// 5. Assignment history (registered before /:id for clarity)
router.get(
  '/:id/assignments',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.getLeadAssignments,
);

// AI Predictive Lead Scoring
router.get(
  '/:id/ai-score',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.getLeadAiScore,
);

router.post(
  '/:id/ai-score',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.computeLeadAiScore,
);

// Activities on a lead
router.post(
  '/:id/activities',
  authenticate,
  requirePermission('activities.create'),
  activityController.createActivity,
);

router.get(
  '/:id/activities',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  activityController.listLeadActivities,
);

// 6. Get single lead detail
router.get(
  '/:id',
  authenticate,
  requirePermission(...VIEW_PERMISSIONS),
  leadController.getLeadById,
);

// 7. Update lead fields
router.put(
  '/:id',
  authenticate,
  requirePermission('leads.update'),
  leadController.updateLead,
);

// 8. Change lead status
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('leads.update'),
  leadController.changeLeadStatus,
);

// 9. Assign lead
router.patch(
  '/:id/assign',
  authenticate,
  requirePermission('leads.assign'),
  leadController.assignLead,
);

// 10. Soft-delete lead
router.delete(
  '/:id',
  authenticate,
  requirePermission('leads.delete'),
  leadController.deleteLead,
);

export { router as leadRoutes };

