import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { updateZohoLead } from '@/lib/zoho';

export async function GET(request: Request) { return handleReconcile(request); }
export async function POST(request: Request) { return handleReconcile(request); }

const formatDate = (d: string | null) =>
  d ? d.replace(/\.\d{3}Z$/, '+00:00') : undefined;

async function handleReconcile(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('[Reconcile] Starting...');

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, zoho_lead_id, wa_state, wa_last_outbound_at, wa_last_template, wa_reply_class, wa_hotness, wa_last_inbound_at, wa_opt_in')
    .is('zoho_synced_at', null)
    .not('zoho_lead_id', 'is', null)
    .limit(50);

  if (error) {
    console.error('[Reconcile] Fetch error:', error);
    return new NextResponse('Error fetching leads', { status: 500 });
  }

  if (!leads || leads.length === 0) {
    console.log('[Reconcile] Nothing to sync.');
    return NextResponse.json({ success: true, synced_count: 0, errors: [] });
  }

  console.log(`[Reconcile] Processing ${leads.length} leads in parallel...`);
  const now = new Date().toISOString();

  const results = await Promise.allSettled(
    leads.map(async (lead) => {
      const payload: Record<string, any> = {
        WA_State:            lead.wa_state,
        WA_Last_Outbound_At: formatDate(lead.wa_last_outbound_at),
        WA_Last_Template:    lead.wa_last_template,
      };
      if (lead.wa_reply_class)     payload.WA_Reply_Class     = lead.wa_reply_class;
      if (lead.wa_hotness)         payload.WA_Hotness         = lead.wa_hotness;
      if (lead.wa_last_inbound_at) payload.WA_Last_Inbound_At = formatDate(lead.wa_last_inbound_at);
      if (lead.wa_opt_in != null)  payload.WA_Opt_In          = lead.wa_opt_in;

      await updateZohoLead(lead.zoho_lead_id, payload);

      await supabase
        .from('leads')
        .update({ zoho_synced_at: now })
        .eq('id', lead.id);

      return lead.zoho_lead_id;
    })
  );

  const synced = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<string>).value);
  const errors = results
    .map((r, i) => r.status === 'rejected' ? { id: leads[i].zoho_lead_id, error: (r as PromiseRejectedResult).reason?.message } : null)
    .filter(Boolean);

  if (errors.length) console.error(`[Reconcile] ${errors.length} failures:`, errors);
  console.log(`[Reconcile] Done: ${synced.length} synced, ${errors.length} failed.`);

  return NextResponse.json({ success: true, synced_count: synced.length, errors });
}
