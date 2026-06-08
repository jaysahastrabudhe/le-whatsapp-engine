import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { updateZohoLead } from '@/lib/zoho';
import { MOVABLE_STAGES, waStateForStage } from '@/lib/funnel';

// Manually move a lead to a funnel stage (MQL / MQL+ / MQL++ / MQL+++ / SQL).
// Writes lead_stage in Supabase and pushes Lead_Stage to Zoho.
export async function POST(request: Request) {
  try {
    const { leadId, zohoLeadId, stage } = await request.json();

    if (!leadId || !stage) {
      return NextResponse.json({ error: 'leadId and stage are required' }, { status: 400 });
    }
    if (!MOVABLE_STAGES.includes(stage)) {
      return NextResponse.json({ error: `Invalid stage. Allowed: ${MOVABLE_STAGES.join(', ')}` }, { status: 400 });
    }

    const update: Record<string, any> = {
      lead_stage: stage,
      zoho_synced_at: null,
      updated_at: new Date().toISOString(),
    };
    // Align the engagement state with the stage so the lead lands in the right box.
    const wa = waStateForStage(stage);
    if (wa) update.wa_state = wa;

    const { error } = await supabase.from('leads').update(update).eq('id', leadId);
    if (error) throw error;

    // Push to Zoho (best-effort — reconcile cron retries on failure).
    let zohoOk = true;
    if (zohoLeadId) {
      try {
        await updateZohoLead(zohoLeadId, { Lead_Stage: stage });
      } catch (e: any) {
        console.warn('[Move Stage] Zoho writeback failed:', e.message);
        zohoOk = false;
      }
    }

    return NextResponse.json({ success: true, stage, zohoWritten: zohoOk });
  } catch (error: any) {
    console.error('[Move Stage] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
