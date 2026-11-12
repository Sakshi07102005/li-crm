import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as auditCtrl from '../controllers/audit.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('audit.view'),
  auditCtrl.listAuditLogs,
);

export const auditRoutes = router;
export default router;

