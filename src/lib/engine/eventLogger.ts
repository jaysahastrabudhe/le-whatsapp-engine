import { supabase } from '../supabase';

export type RoutingReason =
  | 'graph_match'
  | 'graph_no_source_parent'
  | 'graph_no_source_student'
  | 'graph_filtered_storysells'
  | 'graph_filtered_no_relocate'
  | 'graph_filtered_low_urgency'
  | 'graph_unrouted'
  | 'outside_window'
  | 'opted_out'
  | 'already_contacted';

export type RoutingTrigger =
  | 'zoho_webhook'
  | 'wa_pending_sweep'
  | 'reengagement_cron';

export interface RoutingEventPayload {
  trigger: RoutingTrigger;
  graph_used: boolean;
  lead_source: string | null;
  persona: string | null;
  template_selected: string | null;
  template_sid: string | null;
  reason: RoutingReason;
}

export async function logRoutingEvent(
  leadId: string,
  payload: RoutingEventPayload
): Promise<void> {
  const { error } = await supabase.from('lead_events').insert({
    lead_id: leadId,
    event_type: 'routing_decision',
    payload,
  });
  if (error) {
    // Non-fatal — never let logging failure break the send path
    console.error('[EventLogger] Failed to write routing_decision event:', error.message);
  }
}
