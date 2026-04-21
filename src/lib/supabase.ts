import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Ensure the types match the SQL schema defined in supabase/migrations
export type Lead = {
  id: string;
  zoho_lead_id: string | null;
  phone_normalised: string;
  name: string | null;
  email: string | null;
  lead_source: string | null;
  campaign_name: string | null;
  owner_email: string | null;
  // Form fields synced from Zoho at intake
  program: string | null;          // 'BBA Pune' | 'Storysells' | etc.
  persona: string | null;          // 'Student' | 'Parent'
  academic_level: string | null;   // '12th' | '11th' | '10th' | 'Graduate' | 'Already in college'
  relocate_to_pune: string | null; // 'Yes' | 'No'
  // CRM stage fields (synced from Zoho)
  lead_stage: string | null;        // 'Lead' | 'MQL' | 'SQL' | 'Selection' | 'Closing'
  lead_status: string | null;       // 'Attempted to Contact' | 'Contacted' | 'Not Qualified' | etc.
  // Computed / written by rules engine
  urgency: string | null;          // 'HIGH' | 'MEDIUM' | 'LOW'
  lead_track: string | null;       // 'enterprise_leadership' | 'family_business' | 'venture_builder'
  webinar_rsvp: boolean | null;    // true | false | null (null = not yet asked)
  wa_opt_in: boolean;
  wa_state: string;
  wa_hotness: string | null;
  wa_last_outbound_at: string | null; // ISO string
  wa_last_inbound_at: string | null;
  wa_last_template: string | null;
  wa_last_status: string | null;
  wa_last_twilio_sid: string | null;
  wa_reply_class: string | null;
  wa_sender_key: string | null;
  wa_human_response_due_at: string | null;
  created_at: string;
  updated_at: string;
};

// ... Extend types as needed (Message, Event, etc.) or generate from Supabase CLI

export const supabase = createClient(
  config.NEXT_PUBLIC_SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY
);
