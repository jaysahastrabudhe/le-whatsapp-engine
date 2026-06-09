import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { WA_MSG_SENT } from '@/lib/funnel';

// Sharjeel marks an MQL as "message sent — awaiting reply": the lead leaves the
// uncontacted MQL box and lands in the "Awaiting Reply" box. Records a message_sent
// call_log so it shows in his daily count.
export async function POST(request: Request) {
  try {
    const { leadId, caller, notes } = await request.json();
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }
    const by = caller || 'Sharjeel';
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from('leads')
      .update({
        wa_state: WA_MSG_SENT,
        lead_status: 'Attempted to Contact',
        wa_last_outbound_at: nowIso,
        zoho_synced_at: null,
        updated_at: nowIso,
      })
      .eq('id', leadId);
    if (error) throw error;

    await supabase.from('call_logs').insert({
      lead_id: leadId,
      caller: by,
      called_at: nowIso,
      contact_status: 'message_sent',
      notes: notes?.trim() || 'Message sent — awaiting reply.',
      next_action: 'no_answer',
    }).then(({ error: e }) => { if (e) console.warn('[Mark Messaged] log failed:', e.message); });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Mark Messaged] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
