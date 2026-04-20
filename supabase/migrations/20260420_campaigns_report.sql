-- Add report JSONB column to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS report JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS zoho_upload_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'supabase_segment';

-- Index for fast report lookup
CREATE INDEX IF NOT EXISTS idx_campaigns_source ON campaigns(source);

-- Create table for zoho upload tracking
CREATE TABLE IF NOT EXISTS zoho_upload_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     TEXT,
  row_count    INT,
  matched      INT,
  created      INT,
  skipped      INT,
  campaign_id  UUID REFERENCES campaigns(id),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);
