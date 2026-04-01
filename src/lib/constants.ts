/**
 * Source of Truth for Workflow Constants
 * -------------------------------------
 * Template SIDs are NOT stored here — they are fetched from Twilio,
 * persisted in the `templates` Supabase table, and cached in Redis.
 * Use getTwilioTemplateSid(name) to resolve a name → SID at runtime.
 */

// Known template friendly_names (used for routing logic and UI dropdowns).
// SIDs are resolved at runtime from Supabase/Twilio — never hardcoded here.
export const KNOWN_TEMPLATES = [
  'wa_welcome_manual',
  'wa_welcome_meta_student',
  'wa_welcome_meta_parent',
  'wa_welcome_organic_student',
  'wa_welcome_organic_parent',
  'wa_counsellor_intro',
  'wa_followup_1',
  'wa_followup_2_quickreply',
  'wa_track_selector',
  'wa_webinar_cta',
] as const;

// Keep TEMPLATE_SIDS as empty — consumed by analytics SID→name lookup.
// Populated at runtime from the templates table via getApprovedTemplates().
export const TEMPLATE_SIDS: Record<string, string> = {};

// Allowed states for Trigger nodes (wa_state column in 'leads' table)
export const WORKFLOW_STATES = [
  'wa_pending',
  'first_sent',
  'followup_sent',
  'replied',
  'wa_hot',
  'wa_nurture',
  'wa_sent',
  'wa_delivered',
  'wa_read',
  'wa_manual_triage',
  'wa_closed',
  'track_selector_sent',
  'wa_human_handoff',
];

// Lead fields available for Condition node evaluation
export const LEAD_FIELDS = [
  { id: 'lead_source',      label: 'Lead Source' },
  { id: 'persona',          label: 'Persona (Student / Parent)' },
  { id: 'program',          label: 'Program' },
  { id: 'academic_level',   label: 'Academic Level' },
  { id: 'relocate_to_pune', label: 'Relocate to Pune?' },
  { id: 'urgency',          label: 'Urgency' },
  { id: 'lead_track',       label: 'Lead Track' },
  { id: 'wa_hotness',       label: 'Hotness (Score)' },
  { id: 'wa_reply_class',   label: 'Reply Category' },
  { id: 'wa_state',         label: 'Current State' },
];

// Values shown as a dropdown when the selected field has a fixed set of options
export const FIELD_VALUES: Record<string, string[]> = {
  lead_source:      ['Meta Ads', 'Organic', 'Website', 'Manual', 'Phone', 'Instagram', 'Referral', 'Google Ads', 'Direct'],
  persona:          ['Student', 'Parent'],
  program:          ['BBA Pune', 'Storysells'],
  academic_level:   ['12th', '11th', '10th', 'Graduate', 'Already in college'],
  relocate_to_pune: ['Yes', 'No'],
  urgency:          ['HIGH', 'MEDIUM', 'LOW'],
  lead_track:       ['enterprise_leadership', 'family_business', 'venture_builder'],
  wa_hotness:       ['hot', 'warm', 'cold', 'dead'],
  wa_reply_class:   ['interested', 'fee_question', 'not_now', 'wrong_number', 'stop', 'other'],
  wa_state:         [...['wa_pending', 'first_sent', 'followup_sent', 'track_selector_sent', 'replied', 'wa_hot', 'wa_nurture', 'wa_closed']],
};

// Lead Source common values (kept for backwards compat with Builder)
export const SOURCE_VALUES = FIELD_VALUES.lead_source;
