import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createZohoTask } from '@/lib/zoho';

export async function GET(request: Request) {
  return handleSla(request);
}

export async function POST(request: Request) {
  return handleSla(request);
}

async function handleSla(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('[Cron] Checking SLA breaches...');

  const now = new Date().toISOString();

  const { data: breaches, error } = await supabase
    .from('leads')
    .select('id, name, zoho_lead_id, owner_email, wa_reply_class, wa_hotness, wa_human_response_due_at')
    .lt('wa_human_response_due_at', now)
    .not('wa_state', 'in', '("wa_closed","wa_sla_escalated","wa_sla_resolved")')
    .limit(50);

  if (error) {
    console.error('[SLA Monitor Error]', error);
    return new NextResponse('Error fetching SLA breaches', { status: 500 });
  }

  const results: { id: string; zohoTaskCreated: boolean }[] = [];

  for (const lead of breaches) {
    const breachTime = new Date(lead.wa_human_response_due_at!).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });

    const subject = `⚠ SLA Breach — ${lead.name || lead.id} awaiting response`;
    const description = [
      `Lead: ${lead.name || '(no name)'}`,
      `Reply type: ${lead.wa_reply_class || 'unknown'} (${lead.wa_hotness || 'unknown'})`,
      `SLA due: ${breachTime} IST`,
      `Assigned to: ${lead.owner_email || 'unassigned'}`,
      `Action required: Call or WhatsApp the lead within the hour.`,
    ].join('\n');

    let zohoTaskCreated = false;
    if (lead.zoho_lead_id) {
      zohoTaskCreated = await createZohoTask(lead.zoho_lead_id, subject, description);
    } else {
      console.warn(`[SLA Monitor] Lead ${lead.id} has no zoho_lead_id — skipping Zoho task.`);
    }

    // Mark escalated and clear the timer (prevents re-triggering)
    await supabase
      .from('leads')
      .update({
        wa_state:                  'wa_sla_escalated',
        wa_human_response_due_at:  null,
        updated_at:                now,
      })
      .eq('id', lead.id);

    results.push({ id: lead.id, zohoTaskCreated });
    console.log(`[SLA Monitor] Lead ${lead.zoho_lead_id || lead.id} escalated. Zoho task: ${zohoTaskCreated}`);
  }

  return NextResponse.json({
    success: true,
    breaches_found: results.length,
    results,
  });
}
