-- =============================================================================
-- Migration: 001_reference_data.sql
-- Description: Reference data for Logische Innovative CRM
-- Includes: Products, Lead Sources, Lead Statuses, Deal Stages
-- =============================================================================

CREATE TABLE IF NOT EXISTS reference_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ref_category_code UNIQUE (category, code)
);

CREATE INDEX IF NOT EXISTS idx_reference_items_category ON reference_items(category);

INSERT INTO reference_items (category, code, label, sort_order) VALUES
('product', 'learn_professional', 'LearnProfessional', 1),
('product', 'book_e_health', 'BookEHealth', 2),
('product', 'logische_innovative', 'Logische Innovative Consulting', 3),

('source', 'website', 'Website Inbound', 1),
('source', 'linkedin', 'LinkedIn Outreach', 2),
('source', 'referral', 'Client Referral', 3),
('source', 'cold_outreach', 'Cold Outreach', 4),
('source', 'inbound_call', 'Inbound Call', 5),

('lead_status', 'new', 'New Lead', 1),
('lead_status', 'contacted', 'Contacted', 2),
('lead_status', 'qualified', 'Qualified', 3),
('lead_status', 'proposal_sent', 'Proposal Sent', 4),
('lead_status', 'negotiating', 'Negotiation', 5),
('lead_status', 'won', 'Closed Won', 6),
('lead_status', 'lost', 'Closed Lost', 7),

('deal_stage', 'discovery', 'Discovery', 1),
('deal_stage', 'demo', 'Product Demo', 2),
('deal_stage', 'proposal', 'Proposal Sent', 3),
('deal_stage', 'negotiation', 'Negotiation', 4),
('deal_stage', 'won', 'Closed Won', 5),
('deal_stage', 'lost', 'Closed Lost', 6)
ON CONFLICT (category, code) DO NOTHING;

