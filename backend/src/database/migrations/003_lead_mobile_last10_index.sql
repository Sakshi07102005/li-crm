-- Speeds up duplicate-lead detection by mobile number. Compares the LAST 10 DIGITS so
-- "+91 98765 43210", "09876543210" and "9876543210" are treated as the same number.
CREATE INDEX idx_leads_mobile_last10
  ON leads (RIGHT(REGEXP_REPLACE(mobile, '[^0-9]', '', 'g'), 10))
  WHERE deleted_at IS NULL AND mobile IS NOT NULL;

