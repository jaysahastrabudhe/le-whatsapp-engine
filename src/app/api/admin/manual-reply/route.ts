import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normaliseIndianPhone } from '@/lib/utils/phoneNormaliser';

export async function POST(request: Request) {
  const VALID_SOURCES = ['Instagram', 'Email', 'Direct WhatsApp', 'Manual Replies'];
  try {
    const { phone, source } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }
    const replySource = VALID_SOURCES.includes(source) ? source : 'Manual Replies';

    const phoneNormalised = normaliseIndianPhone(phone);
    if (!phoneNormalised) {
      return NextResponse.json({ error: 'Invalid phone number. Enter a 10-digit Indian mobile number.' }, { status: 400 });
    }

    // Look up lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, name, phone_normalised, zoho_lead_id')
      .eq('phone_normalised', phoneNormalised)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found in Supabase database. Are they synced?' }, { status: 404 });
    }

    // Route the reply into Gargi's "Inbound & Manual Replies" box (wa_state = 'replied').
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        wa_state: 'replied',
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

    // Record the source on a lead_event (no dedicated column; payload holds the source).
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'manual_reply',
      payload: { source: replySource, entered_at: nowIso },
    }).then(({ error }) => {
      if (error) console.warn('[Manual Reply] could not record source event:', error.message);
    });

    return NextResponse.json({ success: true, lead, source: replySource });
  } catch (error: any) {
    console.error('[Manual Reply] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
