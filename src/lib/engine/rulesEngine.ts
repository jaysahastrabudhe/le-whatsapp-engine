import { Lead, supabase } from '../supabase';
import { isWithinSendWindow } from './sessionWindow';
import { evaluateWorkflowGraph } from './logicEvaluator';
import { enqueueOutboundMessage } from '../queue/client';
import { getTwilioTemplateSid } from '../twilio/templates';
import { logRoutingEvent, RoutingTrigger } from './eventLogger';

const PRIMARY_SENDER = '+917709333161';

// UTILITY form-fill confirmation (HX3f2c109c…) — preferred first touch once Meta
// approves it. Meta does not frequency-cap UTILITY templates → ~100% delivery.
const UTILITY_FIRST_TOUCH_TEMPLATE = 'wa_enquiry_received';

export async function handleOptOut(leadId: string) {
  console.log(`[Rules Engine] Processing STOP/Opt-Out for lead ${leadId}`);
  const { error } = await supabase
    .from('leads')
    .update({ wa_opt_in: false, wa_state: 'wa_closed', updated_at: new Date().toISOString(), zoho_synced_at: null })
    .eq('id', leadId);
  if (error) {
    console.error(`[Rules Engine] DB Error processing Opt-Out for ${leadId}`, error);
    throw error;
  }
}

export async function evaluateLeadAction(lead: Lead, trigger: RoutingTrigger = 'zoho_webhook') {
  // ── Hard blockers ─────────────────────────────────────────────────────────
  if (lead.wa_opt_in === false) {
    console.log(`[Rules Engine] Lead ${lead.id} has opted out. Halting.`);
    await logRoutingEvent(lead.id, {
      trigger,
      graph_used: false,
      lead_source: lead.lead_source ?? null,
      persona: lead.persona ?? null,
      template_selected: null,
      template_sid: null,
      reason: 'opted_out',
    });
    return;
  }

  if (!isWithinSendWindow()) {
    console.log(`[Rules Engine] Outside 9am-8pm IST send window. Setting wa_pending for lead ${lead.id}.`);
    await logRoutingEvent(lead.id, {
      trigger,
      graph_used: false,
      lead_source: lead.lead_source ?? null,
      persona: lead.persona ?? null,
      template_selected: null,
      template_sid: null,
      reason: 'outside_window',
    });
    await supabase.from('leads').update({ wa_state: 'wa_pending' }).eq('id', lead.id);
    return;
  }

  if (lead.wa_last_outbound_at !== null) {
    console.log(`[Rules Engine] Lead ${lead.id} already has outbound history — skipping welcome evaluation.`);
    await logRoutingEvent(lead.id, {
      trigger,
      graph_used: false,
      lead_source: lead.lead_source ?? null,
      persona: lead.persona ?? null,
      template_selected: null,
      template_sid: null,
      reason: 'already_contacted',
    });
    return;
  }

  // ── Graph evaluation ──────────────────────────────────────────────────────
  const { data: workflow, error } = await supabase
    .from('workflow_rules')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single();

  if (error || !workflow) {
    console.error(`[Rules Engine] No active workflow graph found. Cannot route lead ${lead.id}.`);
    await markUnrouted(lead, trigger, 'No published workflow graph');
    return;
  }

  const action = evaluateWorkflowGraph(
    lead.wa_state,
    lead,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.conditions_json as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflow.actions_json as any
  );

  console.log(`[Rules Engine] Graph action: ${action.type} (${action.reason}) for lead ${lead.id}`);

  if (action.type === 'close') {
    console.log(`[Rules Engine] Lead ${lead.id} filtered by graph — ${action.reason}`);
    await logRoutingEvent(lead.id, {
      trigger,
      graph_used: true,
      lead_source: lead.lead_source ?? null,
      persona: lead.persona ?? null,
      template_selected: null,
      template_sid: null,
      reason: action.reason,
    });
    await supabase.from('leads').update({ wa_state: 'wa_manual_triage', updated_at: new Date().toISOString(), zoho_synced_at: null }).eq('id', lead.id);
    return;
  }

  if (action.type === 'no_match' || !action.templateName) {
    console.warn(`[Rules Engine] Graph returned no_match for lead ${lead.id} — marking wa_unrouted.`);
    await markUnrouted(lead, trigger, 'Graph returned no_match');
    return;
  }

  // ── Resolve SID ───────────────────────────────────────────────────────────
  // First-touch preference: the UTILITY enquiry confirmation (form-fill receipt).
  // Meta does not frequency-cap UTILITY templates, so it delivers ~100% — the
  // MARKETING welcomes were losing 35–50% of first messages to error 63049.
  // getTwilioTemplateSid only returns APPROVED templates, so this self-activates
  // once Meta approves wa_enquiry_received and silently falls back to the
  // graph-selected marketing welcome until then. The persona-routed marketing
  // content then rides the follow-up chain / the reply session instead.
  let templateName = action.templateName;
  let contentSid = await getTwilioTemplateSid(UTILITY_FIRST_TOUCH_TEMPLATE);
  if (contentSid) {
    templateName = UTILITY_FIRST_TOUCH_TEMPLATE;
    console.log(`[Rules Engine] UTILITY first-touch ${UTILITY_FIRST_TOUCH_TEMPLATE} for lead ${lead.id} (graph suggested ${action.templateName}).`);
  } else {
    contentSid = await getTwilioTemplateSid(action.templateName);
  }
  if (!contentSid) {
    console.error(`[Rules Engine] Unknown template "${action.templateName}" — no SID in Supabase/Twilio. Marking unrouted.`);
    await markUnrouted(lead, trigger, `No SID for template "${action.templateName}"`);
    return;
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────
  console.log(`[Rules Engine] Enqueueing ${templateName} (${contentSid}) → ${lead.phone_normalised}`);

  await logRoutingEvent(lead.id, {
    trigger,
    graph_used: true,
    lead_source: lead.lead_source ?? null,
    persona: lead.persona ?? null,
    template_selected: templateName,
    template_sid: contentSid,
    reason: action.reason,
  });

  await enqueueOutboundMessage({
    to: lead.phone_normalised,
    from: PRIMARY_SENDER,
    contentSid,
    templateName,
    leadId: lead.id,
    contentVariables: JSON.stringify({ '1': lead.name || 'there' }),
  });

  await supabase
    .from('leads')
    .update({
      wa_state: 'first_sent',
      wa_last_outbound_at: new Date().toISOString(),
      wa_last_template: templateName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markUnrouted(lead: Lead, trigger: RoutingTrigger, logNote: string) {
  await logRoutingEvent(lead.id, {
    trigger,
    graph_used: true,
    lead_source: lead.lead_source ?? null,
    persona: lead.persona ?? null,
    template_selected: null,
    template_sid: null,
    reason: 'graph_unrouted',
  });

  // Write a visible message row so it shows up in the analytics log
  await supabase.from('messages').insert({
    lead_id: lead.id,
    direction: 'outbound',
    status: 'unrouted',
    template_id: null,
    template_variant_id: null,
    content: `Unrouted: ${logNote}`,
    sender_number: PRIMARY_SENDER,
    phone_normalised: lead.phone_normalised,
    sent_at: new Date().toISOString(),
  });

  await supabase
    .from('leads')
    .update({ wa_state: 'wa_unrouted', updated_at: new Date().toISOString(), zoho_synced_at: null })
    .eq('id', lead.id);
}
