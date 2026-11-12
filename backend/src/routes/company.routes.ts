import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as companyController from '../controllers/company.controller';
import * as contactController from '../controllers/contact.controller';

const router = Router();

// List companies
router.get(
  '/',
  authenticate,
  requirePermission('companies.view'),
  companyController.listCompanies,
);

// Create company
router.post(
  '/',
  authenticate,
  requirePermission('companies.manage'),
  companyController.createCompany,
);

// Get company leads
router.get(
  '/:id/leads',
  authenticate,
  requirePermission('companies.view'),
  companyController.getCompanyLeads,
);

// Company contacts
router.get(
  '/:id/contacts',
  authenticate,
  requirePermission('companies.view'),
  contactController.getCompanyContacts,
);

router.post(
  '/:id/contacts',
  authenticate,
  requirePermission('contacts.manage'),
  contactController.createContact,
);

// Get single company detail
router.get(
  '/:id',
  authenticate,
  requirePermission('companies.view'),
  companyController.getCompanyById,
);

// Update company
router.put(
  '/:id',
  authenticate,
  requirePermission('companies.manage'),
  companyController.updateCompany,
);

// Delete company
router.delete(
  '/:id',
  authenticate,
  requirePermission('leads.delete'),
  companyController.deleteCompany,
);

export { router as companyRoutes };

