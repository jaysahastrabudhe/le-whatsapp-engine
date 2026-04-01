import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  return handleReconcile(request);
}

export async function POST(request: Request) {
  return handleReconcile(request);
}

async function handleReconcile(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[Reconcile] Unauthorized access attempt');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('[Cron] Starting Zoho reconciliation...');

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, phone_normalised, zoho_lead_id, wa_state, wa_last_outbound_at, wa_last_template, wa_reply_class, wa_hotness, wa_last_inbound_at, wa_opt_in')
    .is('zoho_synced_at', null)
    .not('zoho_lead_id', 'is', null)
    .limit(50);

  if (error) {
    console.error('[Reconciliation Error]', error);
    return new NextResponse('Error fetching leads to sync', { status: 500 });
  }

  const results: string[] = [];
  const errors: any[] = [];

  const formatDate = (d: string | null) =>
    d ? d.replace(/\.\d{3}Z$/, '+00:00') : undefined;

  for (const lead of leads) {
    try {
      const { updateZohoLead } = await import('@/lib/zoho');

      const zohoPayload: Record<string, any> = {
        WA_State:            lead.wa_state,
        WA_Last_Outbound_At: formatDate(lead.wa_last_outbound_at),
        WA_Last_Template:    lead.wa_last_template,
      };

      // Include inbound classification fields if present
      if (lead.wa_reply_class)     zohoPayload.WA_Reply_Class     = lead.wa_reply_class;
      if (lead.wa_hotness)         zohoPayload.WA_Hotness         = lead.wa_hotness;
      if (lead.wa_last_inbound_at) zohoPayload.WA_Last_Inbound_At = formatDate(lead.wa_last_inbound_at);
      if (lead.wa_opt_in !== null && lead.wa_opt_in !== undefined) zohoPayload.WA_Opt_In = lead.wa_opt_in;

      await updateZohoLead(lead.zoho_lead_id, zohoPayload);

      // Mark as synced on success
      await supabase
        .from('leads')
        .update({ zoho_synced_at: new Date().toISOString() })
        .eq('id', lead.id);

      results.push(lead.zoho_lead_id);
    } catch (err: any) {
      console.error(`[Reconciliation] Failed to sync lead ${lead.zoho_lead_id}:`, err);
      errors.push({ id: lead.zoho_lead_id, error: err.message });
    }
  }

  console.log(`[Cron] Zoho reconciliation sweep complete: ${results.length} synced, ${errors.length} failed.`);
  return NextResponse.json({ success: true, synced_count: results.length, leads: results, errors });
}
