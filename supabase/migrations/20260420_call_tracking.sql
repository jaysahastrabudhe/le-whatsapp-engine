-- Add columns to leads for tracking calls
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_call_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_assigned_to TEXT;

-- Create call_logs table
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  caller TEXT NOT NULL,
  called_at TIMESTAMPTZ NOT NULL,
  contact_status TEXT NOT NULL, -- 'answered', 'no_answer', 'call_back_later'
  notes TEXT,
  next_action TEXT NOT NULL, -- 'discovery_call', 'followup_on_date', 'no_answer', 'ready_to_fill'
  next_action_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
