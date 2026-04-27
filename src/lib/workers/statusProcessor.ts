import { Job } from 'bullmq';
import { supabase } from '@/lib/supabase';

export async function processStatusUpdate(job: Job) {
  const { MessageSid, MessageStatus, ErrorCode } = job.data;
  
  // Normalise status — Twilio uses 'undelivered' for async failures (e.g. 63049),
  // but we store 'failed' for consistency with our schema and analytics.
  const normalisedStatus = MessageStatus === 'undelivered' ? 'failed' : MessageStatus;
  const now = new Date().toISOString();

  // 1. Update message status + delivery timestamps
  await supabase
    .from('messages')
    .update({
      status:       normalisedStatus,
      ...(ErrorCode              ? { error_code:    ErrorCode } : {}),
      ...(normalisedStatus === 'delivered' ? { delivered_at: now }      : {}),
      ...(normalisedStatus === 'read'      ? { delivered_at: now, read_at: now } : {}),
    })
    .eq('twilio_sid', MessageSid);

  // 2. Fetch associated message to get the lead's phone number and lead_id
  const { data: msg, error: msgError } = await supabase
    .from('messages')
    .select('phone_normalised, lead_id')
    .eq('twilio_sid', MessageSid)
    .single();

  if (msgError || !msg) {
    console.warn(`[StatusProcessor] Could not find message ${MessageSid} to sync lead status.`);
    return { success: true, status: MessageStatus, leadSynced: false };
  }

  // 2b. Propagate delivery status into campaign_leads (delivered, read, failed)
  // Only advance the status — never go backwards (read → delivered is not valid)
  if (msg.lead_id && ['delivered', 'read', 'failed'].includes(normalisedStatus)) {
    const validPrior = normalisedStatus === 'read' ? ['sent', 'delivered'] : ['sent'];
    await supabase
      .from('campaign_leads')
      .update({ status: normalisedStatus })
      .eq('lead_id', msg.lead_id)
      .in('status', validPrior);
  }

  const updateObj: Record<string, string | boolean | null> = { wa_last_status: normalisedStatus };

  // 3. Twilio Error codes handling & Compliance
  if (ErrorCode === '63032') { // User Opted Out / STOP
    updateObj.wa_opt_in = false;
    updateObj.wa_state = 'opted_out';
    updateObj.zoho_synced_at = null;
  } else if (ErrorCode === '21211' || ErrorCode === '63016') { // Invalid number or Template not approved
    updateObj.wa_state = 'invalid_number'; // or failed
    updateObj.wa_hotness = 'dead';
    updateObj.zoho_synced_at = null;
  }

  const { error: leadErr } = await supabase
    .from('leads')
    .update(updateObj)
    .eq('phone_normalised', msg.phone_normalised);

  if (leadErr) {
    console.error(`[StatusProcessor] Failed to update lead ${msg.phone_normalised}:`, leadErr);
    throw new Error('Database error updating status on lead');
  }

  return { success: true, status: MessageStatus, leadSynced: true };
}
