-- Add scheduling and deduplication support to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS dedupe_days INT DEFAULT 0;

-- Ensure status check allows draft and scheduled
-- (Assuming status is TEXT, but if it has a constraint we'd update it here)
-- No explicit check constraint found in previous views, so we're safe to use 'draft' and 'scheduled'
