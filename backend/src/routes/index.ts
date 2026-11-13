import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from '../config/swagger';
import { ensurePermission } from '../utils/permissions';
import { sendEmail, leadAssignedEmail } from '../services/email.service';
import { AuthUser } from '../types/express';
import { authRoutes } from './auth.routes';
import { healthRoutes } from './health.routes';
import { userRoutes } from './user.routes';
import { rbacRoutes } from './rbac.routes';
import { leadRoutes } from './lead.routes';
import { importRoutes } from './import.routes';
import { companyRoutes } from './company.routes';
import { contactRoutes } from './contact.routes';
import { followupRoutes } from './followup.routes';
import { taskRoutes } from './task.routes';
import { reportRoutes } from './report.routes';
import { notificationRoutes } from './notification.routes';
import { auditRoutes } from './audit.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/leads/import', importRoutes);
router.use('/leads', leadRoutes);
router.use('/companies', companyRoutes);
router.use('/contacts', contactRoutes);
router.use('/followups', followupRoutes);
router.use('/tasks', taskRoutes);

/** Test‑email endpoint */
router.post(
  ['/notifications/test-email', '/api/notifications/test-email'],
  ensurePermission('users.manage'),
  async (req: Request, res: Response) => {
    const user = (req.user as AuthUser) || { email: 'test@example.com' };
    // Re‑use any template – subject/body not critical for test
    const tmpl = leadAssignedEmail({ leadId: 'test' });
    const result = await sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text });
    res.json({ sent: result.sent });
  },
);

router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/', reportRoutes);
router.use('/', rbacRoutes);

// Swagger documentation
router.get('/docs.json', (_req: Request, res: Response) => {
  res.status(200).json(swaggerDocument);
});
router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

export const rootRouter = router;
export default router;
