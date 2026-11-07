-- =====================================================================
-- LI CRM - 001_init_schema.sql
-- 19 domain tables (+ schema_migrations created by the migration runner)
-- Conventions:
--   * Lookup tables (roles, products, ...)   -> SMALLINT identity ids
--   * Business entities (users, leads, ...)  -> UUID ids
--   * Enum-like columns are TEXT + CHECK constraints, snake_case values
--   * Soft delete via deleted_at on companies, contacts, leads
-- =====================================================================

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. ROLES / PERMISSIONS (RBAC)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,             -- admin, business_head, ...
  name        TEXT NOT NULL UNIQUE,             -- display name
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,             -- e.g. leads.create
  description TEXT
);

CREATE TABLE role_permissions (                 -- many-to-many
  role_id       SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id SMALLINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 2. USERS and REFRESH TOKENS
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT,
  avatar_url    TEXT,
  role_id       SMALLINT NOT NULL REFERENCES roles(id),
  manager_id    UUID REFERENCES users(id) ON DELETE SET NULL,  -- team hierarchy
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_users_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT chk_users_not_own_manager CHECK (manager_id IS NULL OR manager_id <> id)
);
CREATE UNIQUE INDEX uq_users_email_lower ON users (LOWER(email));
CREATE INDEX idx_users_role ON users (role_id);
CREATE INDEX idx_users_manager ON users (manager_id);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refresh_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,          -- SHA-256 of the token, never the token
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  replaced_by_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,  -- rotation chain
  user_agent     TEXT,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- ---------------------------------------------------------------------
-- 3. LOOKUP TABLES: products, lead sources, lead statuses, transitions
-- ---------------------------------------------------------------------
CREATE TABLE products (
  id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,              -- LEARNPROFESSIONAL / BOOKEHEALTH / LI
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lead_sources (
  id           SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  is_marketing BOOLEAN NOT NULL DEFAULT FALSE,  -- visible to Marketing Executives
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lead_statuses (
  id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order SMALLINT NOT NULL UNIQUE,
  is_final   BOOLEAN NOT NULL DEFAULT FALSE     -- Converted / Lost
);

CREATE TABLE lead_status_transitions (          -- allowed workflow moves
  from_status_id SMALLINT NOT NULL REFERENCES lead_statuses(id) ON DELETE CASCADE,
  to_status_id   SMALLINT NOT NULL REFERENCES lead_statuses(id) ON DELETE CASCADE,
  PRIMARY KEY (from_status_id, to_status_id),
  CONSTRAINT chk_transition_not_same CHECK (from_status_id <> to_status_id)
);

-- ---------------------------------------------------------------------
-- 4. COMPANIES and CONTACTS
-- ---------------------------------------------------------------------
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  website    TEXT,
  industry   TEXT,
  size       TEXT,
  location   TEXT,
  notes      TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_companies_size CHECK
    (size IS NULL OR size IN ('1-10','11-50','51-200','201-500','501-1000','1000+'))
);
CREATE UNIQUE INDEX uq_companies_name_lower ON companies (LOWER(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_industry ON companies (industry);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  designation TEXT,
  email       TEXT,
  mobile      TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT chk_contacts_email CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE INDEX idx_contacts_company ON contacts (company_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_contacts_one_primary ON contacts (company_id)
  WHERE is_primary AND deleted_at IS NULL;      -- max one primary contact per company
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 5. LEADS (core table)
-- ---------------------------------------------------------------------
CREATE SEQUENCE lead_code_seq START 1;

CREATE TABLE leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code         TEXT NOT NULL UNIQUE
                    DEFAULT ('LI-LEAD-' || LPAD(NEXTVAL('lead_code_seq')::TEXT, 6, '0')),
  lead_name         TEXT NOT NULL,                       -- contact person
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  company_name      TEXT,                                -- as typed; works without a company record
  email             TEXT,
  mobile            TEXT,
  website           TEXT,
  industry          TEXT,
  product_id        SMALLINT NOT NULL REFERENCES products(id),
  source_id         SMALLINT NOT NULL REFERENCES lead_sources(id),
  assigned_to       UUID REFERENCES users(id) ON DELETE SET NULL,
  priority          TEXT NOT NULL DEFAULT 'medium',
  status_id         SMALLINT NOT NULL REFERENCES lead_statuses(id),
  next_follow_up_at TIMESTAMPTZ,
  remarks           TEXT,
  lost_reason       TEXT,
  converted_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT chk_leads_priority CHECK (priority IN ('high','medium','low')),
  CONSTRAINT chk_leads_email CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT chk_leads_has_contact CHECK (email IS NOT NULL OR mobile IS NOT NULL)
);
-- NOTE: email/mobile are deliberately NOT unique. Duplicates are detected and
-- warned about by the API (using the two indexes below), not blocked by the DB.
CREATE INDEX idx_leads_email_lower ON leads (LOWER(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX idx_leads_mobile_digits ON leads (REGEXP_REPLACE(mobile, '[^0-9]', '', 'g'))
  WHERE deleted_at IS NULL AND mobile IS NOT NULL;
CREATE INDEX idx_leads_status       ON leads (status_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned     ON leads (assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_product      ON leads (product_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_source       ON leads (source_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_company      ON leads (company_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_created_at   ON leads (created_at)  WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_next_followup ON leads (next_follow_up_at) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Assignment / reassignment history
CREATE TABLE lead_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_from UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lead_assignments_lead ON lead_assignments (lead_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 6. FOLLOW-UPS, TASKS, ACTIVITIES
-- ---------------------------------------------------------------------
CREATE TABLE follow_ups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  type         TEXT NOT NULL DEFAULT 'call',
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  outcome      TEXT,
  completed_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,                  -- used by the push-notification scheduler
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_followups_type   CHECK (type IN ('call','email','meeting','whatsapp','other')),
  CONSTRAINT chk_followups_status CHECK (status IN ('pending','completed','missed','rescheduled'))
);
CREATE INDEX idx_followups_lead ON follow_ups (lead_id);
CREATE INDEX idx_followups_due  ON follow_ups (assigned_to, status, scheduled_at);
CREATE TRIGGER trg_followups_updated BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date     TIMESTAMPTZ,
  priority     TEXT NOT NULL DEFAULT 'medium',
  status       TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_tasks_priority CHECK (priority IN ('high','medium','low')),
  CONSTRAINT chk_tasks_status   CHECK (status IN ('pending','in_progress','completed','cancelled'))
);
CREATE INDEX idx_tasks_assignee ON tasks (assigned_to, status, due_date);
CREATE INDEX idx_tasks_lead     ON tasks (lead_id);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE activities (                       -- the lead timeline
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  subject       TEXT,
  notes         TEXT,
  outcome       TEXT,
  old_status_id SMALLINT REFERENCES lead_statuses(id),
  new_status_id SMALLINT REFERENCES lead_statuses(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_activities_type CHECK (type IN
    ('call','email','meeting','note','status_change','assignment','follow_up','task'))
);
CREATE INDEX idx_activities_lead ON activities (lead_id, occurred_at DESC);
CREATE INDEX idx_activities_user ON activities (user_id, occurred_at DESC);

-- ---------------------------------------------------------------------
-- 7. NOTIFICATIONS, DEVICE TOKENS, AUDIT LOGS
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  type        TEXT NOT NULL DEFAULT 'general',
  entity_type TEXT,
  entity_id   UUID,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE device_tokens (                    -- Firebase Cloud Messaging tokens
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  platform   TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_device_platform CHECK (platform IN ('android','ios','web'))
);
CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);

CREATE TABLE audit_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                      -- e.g. lead.create, auth.login
  entity_type TEXT,
  entity_id   TEXT,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_user   ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
