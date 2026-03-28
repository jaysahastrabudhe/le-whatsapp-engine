import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';

const PRIMARY_SENDER = '+917709333161';
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const { phone, leadId, message } = await request.json();

  if (!phone || !leadId || !message?.trim()) {
    return NextResponse.json({ error: 'phone, leadId and message are required' }, { status: 400 });
  }

  // Verify 24-hour window is still open
  const { data: lead } = await supabase
    .from('leads')
    .select('wa_last_inbound_at, name')
    .eq('id', leadId)
    .single();

  if (!lead?.wa_last_inbound_at) {
    return NextResponse.json({ error: 'No inbound message on record — cannot send free-form reply' }, { status: 400 });
  }

  const windowCutoff = new Date(Date.now() - WINDOW_MS);
  if (new Date(lead.wa_last_inbound_at) < windowCutoff) {
    return NextResponse.json({ error: '24-hour reply window has closed for this lead' }, { status: 400 });
  }

  // Send free-form message via Twilio (works within the 24h customer service window)
  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  let msg;
  try {
    msg = await client.messages.create({
      to:   `whatsapp:${phone}`,
      from: `whatsapp:${PRIMARY_SENDER}`,
      body: message.trim(),
    });
  } catch (err: any) {
    console.error('[SendReply] Twilio error:', err);
    return NextResponse.json({ error: err.message || 'Twilio send failed' }, { status: 502 });
  }

  // Record outbound message
  await supabase.from('messages').insert({
    lead_id:          leadId,
    direction:        'outbound',
    twilio_sid:       msg.sid,
    content:          message.trim(),
    status:           'sent',
    sender_number:    PRIMARY_SENDER,
    phone_normalised: phone,
    sent_at:          new Date().toISOString(),
  });

  console.log(`[SendReply] Sent free-form to ${phone} (${lead.name}) — SID: ${msg.sid}`);
  return NextResponse.json({ success: true, sid: msg.sid });
}
