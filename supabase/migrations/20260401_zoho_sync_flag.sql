-- Add zoho_synced_at column to track when the lead's state was last written back to Zoho
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zoho_synced_at TIMESTAMPTZ;

-- Index for the reconciliation cron to quickly find dirty rows
CREATE INDEX IF NOT EXISTS idx_leads_zoho_sync ON leads (zoho_synced_at) WHERE zoho_synced_at IS NULL;
