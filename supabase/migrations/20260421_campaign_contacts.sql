-- Add zoho_module to leads (defaults to 'leads' for backward compat; 'contacts' skips Zoho writeback)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zoho_module TEXT NOT NULL DEFAULT 'leads';

-- Staging table for Zoho contacts not yet in leads
-- These are sent campaigns and promoted to leads on first reply
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id TEXT NOT NULL,
  zoho_module TEXT NOT NULL DEFAULT 'contacts',
  name TEXT,
  phone_normalised TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging',  -- 'staging', 'promoted'
  promoted_lead_id UUID REFERENCES leads(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zoho_id, zoho_module)
);

-- Link campaign_leads to either a lead or a staged contact
ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES campaign_contacts(id) ON DELETE CASCADE;
