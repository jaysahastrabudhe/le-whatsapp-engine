-- Add CRM stage tracking fields to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_stage  TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_lead_stage  ON public.leads (lead_stage);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON public.leads (lead_status);
