import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normaliseIndianPhone } from '@/lib/utils/phoneNormaliser';

export async function POST(request: Request) {
  const VALID_SOURCES = ['Direct WhatsApp', 'Instagram', 'Web Chat', 'Email'];
  try {
    const { phone, source, messageSent, replyReceived } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }
    const replySource = VALID_SOURCES.includes(source) ? source : 'Web Chat';
    const sentText  = typeof messageSent === 'string' ? messageSent.trim() : '';
    const replyText = typeof replyReceived === 'string' ? replyReceived.trim() : '';

    const phoneNormalised = normaliseIndianPhone(phone);
    if (!phoneNormalised) {
      return NextResponse.json({ error: 'Invalid phone number. Enter a 10-digit Indian mobile number.' }, { status: 400 });
    }

    // Look up lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, name, phone_normalised, zoho_lead_id, lead_stage')
      .eq('phone_normalised', phoneNormalised)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found in Supabase database. Are they synced?' }, { status: 404 });
    }

    // A manual reply enters as MQL++ — but never DOWNGRADE a more-advanced lead
    // (MQL+++ / SQL already past this rung). Only set MQL++ from earlier stages.
    const ADVANCED = ['MQL+++', 'SQL'];
    const nextStage = ADVANCED.includes(lead.lead_stage) ? lead.lead_stage : 'MQL++';

    // Route the reply into Gargi's "Inbound & Manual Replies" box. We use a DISTINCT
    // state 'replied_manual' (not 'replied') so the re-engagement cron — which targets
    // wa_state='replied' to auto-send a WhatsApp template — never messages a lead who
    // actually replied on Instagram / Email / etc. A human (Gargi) owns these.
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        wa_state: 'replied_manual',
        lead_stage: nextStage, // MQL++ (funnel algorithm) unless already further along
        wa_hotness: 'hot', // Assume hot if they replied
        wa_last_inbound_at: nowIso, // surfaces in the inbound feed, sorted by recency
        followup_call_at: null,      // clear any stale scheduled callback
        zoho_synced_at: null,        // mark dirty for reconcile
        updated_at: nowIso,
      })
      .eq('id', lead.id);

    if (updateError) {
      throw updateError;
    }

    // Record source + the actual conversation (message sent / reply received) on the event.
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'manual_reply',
      payload: { source: replySource, entered_at: nowIso, message_sent: sentText || null, reply_received: replyText || null },
    }).then(({ error }) => {
      if (error) console.warn('[Manual Reply] could not record source event:', error.message);
    });

    // Also log the conversation in the messages table so it appears in the Message Log
    // and as a note. Outbound = what Jonathan sent; inbound = the lead's reply.
    const msgRows: any[] = [];
    if (sentText)  msgRows.push({ lead_id: lead.id, phone_normalised: phoneNormalised, direction: 'outbound', content: sentText,  status: 'sent',      sender_number: `manual:${replySource}`, sent_at: nowIso });
    if (replyText) msgRows.push({ lead_id: lead.id, phone_normalised: phoneNormalised, direction: 'inbound',  content: replyText, status: 'received',  sender_number: `manual:${replySource}`, sent_at: nowIso });
    if (msgRows.length > 0) {
      await supabase.from('messages').insert(msgRows).then(({ error }) => {
        if (error) console.warn('[Manual Reply] could not log messages:', error.message);
      });
    }

    return NextResponse.json({ success: true, lead, source: replySource });
  } catch (error: any) {
    console.error('[Manual Reply] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
