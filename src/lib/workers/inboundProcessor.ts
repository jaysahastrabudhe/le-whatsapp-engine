import { supabase } from '@/lib/supabase';
import { classifyReply } from '@/lib/engine/classifier';
import { enqueueOutboundMessage } from '@/lib/queue/client';
import { getTwilioTemplateSid } from '@/lib/twilio/templates';
import { updateZohoLead } from '@/lib/zoho';

const PRIMARY_SENDER = '+917709333161';

// ─── Button postback → classification mapping ────────────────────────────────
// wa_followup_2_quickreply buttons
const BUTTON_MAP: Record<string, { replyClass: string; hotness: string; waState: string }> = {
  INTERESTED:      { replyClass: 'interested', hotness: 'hot',  waState: 'wa_hot'     },
  MORE_INFO:       { replyClass: 'other',      hotness: 'warm', waState: 'wa_hot'     },
  DECIDED_AGAINST: { replyClass: 'not_now',    hotness: 'cold', waState: 'wa_closed'  },
  // wa_track_selector buttons
  ENTERPRISE_LEADERSHIP: { replyClass: 'interested', hotness: 'hot', waState: 'wa_hot' },
  FAMILY_BUSINESS:       { replyClass: 'interested', hotness: 'hot', waState: 'wa_hot' },
  VENTURE_BUILDER:       { replyClass: 'interested', hotness: 'hot', waState: 'wa_hot' },
  // wa_webinar_cta buttons
  WEBINAR_YES: { replyClass: 'interested', hotness: 'warm', waState: 'wa_hot'    },
  WEBINAR_NO:  { replyClass: 'not_now',    hotness: 'cold', waState: 'wa_nurture' },
};

// Track-selector buttons that also write lead_track
const TRACK_BUTTONS: Record<string, string> = {
  ENTERPRISE_LEADERSHIP: 'enterprise_leadership',
  FAMILY_BUSINESS:       'family_business',
  VENTURE_BUILDER:       'venture_builder',
};

export async function processInboundMessage(job: { data: Record<string, string> }) {
  const { MessageSid, From, Body, ButtonPayload } = job.data;

  // Normalise phone — handles +91..., 91..., and bare 10-digit formats
  const rawPhone = (From || '').replace('whatsapp:', '').replace(/\D/g, '');
  const cleanPhone = rawPhone.startsWith('91') && rawPhone.length === 12
    ? `+${rawPhone}`
    : rawPhone.length === 10
      ? `+91${rawPhone}`
      : `+${rawPhone}`;

  const now = new Date().toISOString();

  // ── STEP A: Button postback detection (takes priority over NLP) ─────────────
  let replyClass: string;
  let hotness: string;
  let waState: string;
  let leadTrackUpdate: string | null = null;
  let webinarRsvpUpdate: boolean | null = null;

  if (ButtonPayload && BUTTON_MAP[ButtonPayload]) {
    const mapped = BUTTON_MAP[ButtonPayload];
    replyClass = mapped.replyClass;
    hotness    = mapped.hotness;
    waState    = mapped.waState;

    if (TRACK_BUTTONS[ButtonPayload]) {
      leadTrackUpdate = TRACK_BUTTONS[ButtonPayload];
    }
    if (ButtonPayload === 'WEBINAR_YES') webinarRsvpUpdate = true;
    if (ButtonPayload === 'WEBINAR_NO')  webinarRsvpUpdate = false;

    console.log(`[InboundProcessor] Button tap: ${ButtonPayload} → class=${replyClass}, state=${waState}`);
  } else {
    // ── STEP B: NLP classifier for free-text replies ─────────────────────────
    const classified = await classifyReply(Body || '');
    replyClass = classified.replyClass;
    hotness    = classified.hotness;

    if (classified.optOut) {
      waState = 'wa_closed';
    } else if (replyClass === 'interested' || replyClass === 'fee_question') {
      waState = 'wa_hot';
    } else if (replyClass === 'not_now') {
      waState = 'wa_nurture';
    } else if (replyClass === 'wrong_number' || replyClass === 'stop') {
      waState = 'wa_closed';
    } else {
      waState = 'replied'; // 'other' — human review, but still counts as a reply
    }
  }

  const waOptIn = replyClass !== 'stop';

  // ── Fetch current lead ────────────────────────────────────────────────────
  const { data: currentLead } = await supabase
    .from('leads')
    .select('id, zoho_lead_id, owner_email, lead_track, name')
    .eq('phone_normalised', cleanPhone)
    .single();

  // ── Owner Assignment ───────────────────────────────────────────────────────
  let assignedOwner = null;
  if (currentLead && !currentLead.owner_email && (replyClass === 'interested' || replyClass === 'fee_question')) {
    assignedOwner = 'team@letsenterprise.in';
    console.log(`[Owner Assignment] Lead ${cleanPhone} replied favorably — assigning to ${assignedOwner}`);
  }

  // ── Build Supabase update ─────────────────────────────────────────────────
  const leadUpdate: Record<string, any> = {
    wa_reply_class:    replyClass,
    wa_hotness:        hotness,
    wa_last_inbound_at: now,
    wa_opt_in:         waOptIn,
    wa_state:          waState,
    zoho_synced_at:    null,
    ...(assignedOwner  ? { owner_email: assignedOwner } : {}),
    ...(leadTrackUpdate !== null ? { lead_track: leadTrackUpdate } : {}),
    ...(webinarRsvpUpdate !== null ? { webinar_rsvp: webinarRsvpUpdate } : {}),
  };

  // ── STEP C: SLA alert for hot leads ──────────────────────────────────────
  if (replyClass === 'interested' || replyClass === 'fee_question') {
    const slaDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2h
    leadUpdate.wa_human_response_due_at = slaDeadline;
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .update(leadUpdate)
    .eq('phone_normalised', cleanPhone)
    .select('id, zoho_lead_id, owner_email, lead_track, name')
    .single();

  if (leadError && leadError.code !== 'PGRST116') {
    console.error(`[InboundProcessor] Error updating lead ${cleanPhone}:`, leadError);
    throw new Error('Database error on leads update');
  }

  // ── Save inbound message (idempotent) ─────────────────────────────────────
  const { error: msgError } = await supabase.from('messages').insert({
    lead_id:          lead?.id ?? currentLead?.id ?? null,
    twilio_sid:       MessageSid,
    phone_normalised: cleanPhone,
    direction:        'inbound',
    content:          Body,
    status:           'received',
    sender_number:    cleanPhone,
    sent_at:          now,
  });

  if (msgError && msgError.code !== '23505') {
    console.error(`[InboundProcessor] Error saving message ${MessageSid}:`, msgError);
  }

  // ── Log to lead_events ────────────────────────────────────────────────────
  const eventType = ButtonPayload ? 'button_tap' : 'free_text_reply';
  await supabase.from('lead_events').insert({
    lead_id:    lead?.id ?? currentLead?.id ?? null,
    event_type: eventType,
    payload:    ButtonPayload
      ? { buttonPayload: ButtonPayload, classification: replyClass }
      : { body: Body, classification: replyClass },
  }).then(({ error }) => {
    if (error) console.warn(`[InboundProcessor] lead_events insert failed:`, error.message);
  });

  // ── Post-classification actions ───────────────────────────────────────────

  // Send wa_counsellor_intro for interested / fee_question / track-selector taps
  const sendCounsellor =
    replyClass === 'interested' ||
    replyClass === 'fee_question' ||
    !!TRACK_BUTTONS[ButtonPayload ?? ''];

  if (sendCounsellor) {
    const track = leadTrackUpdate ?? currentLead?.lead_track ?? null;
    const trackLabel = track
      ? track.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null;

    const contentSid = await getTwilioTemplateSid('wa_counsellor_intro');
    if (contentSid) {
      const name = lead?.name ?? currentLead?.name ?? 'there';
      await enqueueOutboundMessage({
        to:               cleanPhone,
        from:             PRIMARY_SENDER,
        contentSid,
        templateName:     'wa_counsellor_intro',
        leadId:           lead?.id || currentLead?.id,
        contentVariables: JSON.stringify({ "1": name }),
      });
      console.log(`[InboundProcessor] Queued wa_counsellor_intro → ${cleanPhone}${trackLabel ? ` (track: ${trackLabel})` : ''}`);
    } else {
      console.warn(`[InboundProcessor] wa_counsellor_intro SID not found — skipping counsellor send.`);
    }
  }

  // Webinar YES — flag for manual counsellor action (no auto-template)
  if (ButtonPayload === 'WEBINAR_YES') {
    console.log(`[InboundProcessor] WEBINAR_YES from ${cleanPhone} — counsellor must send joining details manually.`);
  }

  // ── STEP D: Zoho writeback ───────────────────────────────────────────────
  if (lead?.zoho_lead_id) {
    const zohoUpdate: any = {
      WA_Reply_Class:    replyClass,
      WA_Hotness:        hotness,
      WA_Last_Inbound_At: now.replace(/\.\d{3}Z$/, '+00:00'),
      WA_Opt_In:         waOptIn,
    };

    // If track was updated, sync that too
    if (leadTrackUpdate) {
      zohoUpdate.WA_Track = leadTrackUpdate;
    }

    console.log(`[Zoho Writeback] Syncing ${lead.zoho_lead_id}: class=${replyClass}, hotness=${hotness}`);
    
    // Perform async writeback (don't block the reply queue)
    updateZohoLead(lead.zoho_lead_id, zohoUpdate).catch((err: any) => {
      console.error(`[Zoho Writeback Fail] ${lead.zoho_lead_id}:`, err);
    });

    if (hotness === 'hot') {
      console.log(`[Alert Engine] Hot Lead → Zoho Task & Email for ${lead.zoho_lead_id}`);
    }
  }

  return { success: true, replyClass, waOptIn };
}
