-- =====================================================================
-- LI CRM - 002_reference_data.sql
-- Static reference data. Users are created by seed.ts (needs bcrypt).
-- =====================================================================

-- Roles (from the assignment)
INSERT INTO roles (code, name, description) VALUES
  ('admin',               'Admin',               'Complete system access'),
  ('business_head',       'Business Head',       'Team and sales management'),
  ('sales_executive',     'Sales Executive',     'Own leads and follow-ups'),
  ('marketing_executive', 'Marketing Executive', 'Marketing leads and campaigns');

-- Permissions
INSERT INTO permissions (code, description) VALUES
  ('dashboard.view',      'View dashboard (scope depends on role)'),
  ('users.manage',        'Create, edit, deactivate users and assign roles'),
  ('users.view_team',     'View users in own team'),
  ('leads.view_all',      'View every lead'),
  ('leads.view_team',     'View own leads and leads of team members'),
  ('leads.view_own',      'View only own leads'),
  ('leads.view_marketing','View leads from marketing sources'),
  ('leads.create',        'Create leads'),
  ('leads.update',        'Update leads (within scope)'),
  ('leads.delete',        'Delete leads (soft delete)'),
  ('leads.assign',        'Assign / reassign leads'),
  ('leads.import',        'Bulk import leads'),
  ('companies.view',      'View companies'),
  ('companies.manage',    'Create / edit / delete companies'),
  ('contacts.manage',     'Create / edit / delete contacts'),
  ('followups.manage',    'Schedule and update follow-ups'),
  ('tasks.manage',        'Create and update own tasks'),
  ('tasks.assign',        'Assign tasks to other employees'),
  ('activities.create',   'Record calls, emails, meetings, notes'),
  ('reports.view_all',    'View reports for all data'),
  ('reports.view_team',   'View reports for own team'),
  ('reports.view_own',    'View reports for own data'),
  ('reports.view_marketing','View reports for marketing-source leads'),
  ('reports.export',      'Export reports to CSV / Excel'),
  ('audit.view',          'View audit logs');

-- Admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'admin';

-- Business Head: team + sales management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'dashboard.view','users.view_team','leads.view_team','leads.create','leads.update',
  'leads.delete','leads.assign','leads.import','companies.view','companies.manage',
  'contacts.manage','followups.manage','tasks.manage','tasks.assign','activities.create',
  'reports.view_team','reports.export'
) WHERE r.code = 'business_head';

-- Sales Executive: own leads and follow-ups
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'dashboard.view','leads.view_own','leads.create','leads.update','companies.view',
  'companies.manage','contacts.manage','followups.manage','tasks.manage',
  'activities.create','reports.view_own','reports.export'
) WHERE r.code = 'sales_executive';

-- Marketing Executive: marketing leads and campaigns
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'dashboard.view','leads.view_marketing','leads.create','leads.update','leads.import',
  'companies.view','companies.manage','contacts.manage','tasks.manage',
  'activities.create','reports.view_marketing','reports.export'
) WHERE r.code = 'marketing_executive';

-- Products (three business verticals)
INSERT INTO products (code, name) VALUES
  ('LEARNPROFESSIONAL', 'LearnProfessional'),
  ('BOOKEHEALTH',       'BookEHealth'),
  ('LI',                'Logische Innovative');

-- Lead sources (is_marketing = visible to Marketing Executives)
INSERT INTO lead_sources (name, is_marketing) VALUES
  ('Website',        TRUE),
  ('LinkedIn',       TRUE),
  ('Email Campaign', TRUE),
  ('Social Media',   TRUE),
  ('Webinar / Event',TRUE),
  ('Reference',      FALSE),
  ('Cold Call',      FALSE),
  ('Walk-in',        FALSE),
  ('Other',          FALSE);

-- Lead statuses (assignment workflow order)
INSERT INTO lead_statuses (name, sort_order, is_final) VALUES
  ('New Lead',          1, FALSE),
  ('Contacted',         2, FALSE),
  ('Interested',        3, FALSE),
  ('Meeting Scheduled', 4, FALSE),
  ('Proposal Sent',     5, FALSE),
  ('Negotiation',       6, FALSE),
  ('Converted',         7, TRUE),
  ('Lost',              8, TRUE);

-- Allowed status transitions
-- 1) Forward to any later open stage (New Lead .. Negotiation)
INSERT INTO lead_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM lead_statuses f JOIN lead_statuses t
  ON t.sort_order > f.sort_order AND t.sort_order <= 6
WHERE f.sort_order <= 5;
-- 2) Back exactly one open stage (Contacted .. Negotiation -> previous)
INSERT INTO lead_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM lead_statuses f JOIN lead_statuses t
  ON t.sort_order = f.sort_order - 1
WHERE f.sort_order BETWEEN 2 AND 6;
-- 3) Converted only from Proposal Sent or Negotiation
INSERT INTO lead_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM lead_statuses f JOIN lead_statuses t ON t.name = 'Converted'
WHERE f.name IN ('Proposal Sent', 'Negotiation');
-- 4) Lost from any open stage
INSERT INTO lead_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM lead_statuses f JOIN lead_statuses t ON t.name = 'Lost'
WHERE f.sort_order <= 6;
-- 5) Reopen a Lost lead as New Lead (API restricts this to Admin / Business Head)
INSERT INTO lead_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM lead_statuses f JOIN lead_statuses t ON t.name = 'New Lead'
WHERE f.name = 'Lost';
