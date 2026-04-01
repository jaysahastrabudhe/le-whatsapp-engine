import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const PRIMARY_SENDER = '+917709333161';

export async function POST(request: Request) {
  const { leadId, phoneNormalised } = await request.json();

  if (!leadId || !phoneNormalised) {
    return NextResponse.json({ error: 'leadId and phoneNormalised are required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // 1. Insert a manual outbound record — makes the lead visible in the log
  //    and satisfies the already_contacted guard (wa_last_outbound_at check)
  const { error: msgError } = await supabase.from('messages').insert({
    lead_id:          leadId,
    direction:        'outbound',
    status:           'manual',
    content:          'Manual follow-up sent from phone',
    sender_number:    PRIMARY_SENDER,
    phone_normalised: phoneNormalised,
    sent_at:          now,
  });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // 2. Update lead state — wa_last_outbound_at blocks engine from re-sending
  const { error: leadError } = await supabase
    .from('leads')
    .update({
      wa_state:           'wa_manual',
      wa_last_outbound_at: now,
      updated_at:          now,
    })
    .eq('id', leadId);

  if (leadError) {
    return NextResponse.json({ error: leadError.message }, { status: 500 });
  }

  // 3. Log the event
  await supabase.from('lead_events').insert({
    lead_id:    leadId,
    event_type: 'manual_contact',
    payload:    { note: 'Marked as manually contacted from phone', phone: phoneNormalised },
  }).then(({ error }) => {
    if (error) console.warn('[MarkManual] lead_events insert failed:', error.message);
  });

  return NextResponse.json({ success: true });
}
