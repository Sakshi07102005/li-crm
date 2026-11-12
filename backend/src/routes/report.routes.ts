import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as reportCtrl from '../controllers/report.controller';

const router = Router();

const REPORT_VIEW_PERMS = [
  'reports.view_all',
  'reports.view_team',
  'reports.view_own',
  'reports.view_marketing',
];

// Dashboard
router.get(
  '/dashboard',
  authenticate,
  requirePermission('dashboard.view'),
  reportCtrl.getDashboard,
);

// Reports
router.get(
  '/reports/leads-by-status',
  authenticate,
  requirePermission(...REPORT_VIEW_PERMS),
  reportCtrl.getLeadsByStatus,
);

router.get(
  '/reports/leads-by-source',
  authenticate,
  requirePermission(...REPORT_VIEW_PERMS),
  reportCtrl.getLeadsBySource,
);

router.get(
  '/reports/leads-by-product',
  authenticate,
  requirePermission(...REPORT_VIEW_PERMS),
  reportCtrl.getLeadsByProduct,
);

router.get(
  '/reports/team-performance',
  authenticate,
  requirePermission(...REPORT_VIEW_PERMS),
  reportCtrl.getTeamPerformance,
);

router.get(
  '/reports/conversion-rates',
  authenticate,
  requirePermission(...REPORT_VIEW_PERMS),
  reportCtrl.getConversionRates,
);

export const reportRoutes = router;
export default router;

