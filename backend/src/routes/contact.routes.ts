import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as contactController from '../controllers/contact.controller';

const router = Router();

// Update contact
router.put(
  '/:id',
  authenticate,
  requirePermission('contacts.manage'),
  contactController.updateContact,
);

// Delete contact
router.delete(
  '/:id',
  authenticate,
  requirePermission('contacts.manage'),
  contactController.deleteContact,
);

// Set primary contact
router.patch(
  '/:id/primary',
  authenticate,
  requirePermission('contacts.manage'),
  contactController.setPrimaryContact,
);

export { router as contactRoutes };

