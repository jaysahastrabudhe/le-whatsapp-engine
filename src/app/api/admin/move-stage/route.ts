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
      followup_call_at: null,   // clear any stale callback so the lead lands cleanly
      zoho_synced_at: null,
      updated_at: new Date().toISOString(),
    };
    // Align the engagement state with the stage so the lead lands in exactly one box
    // (waStateForStage now returns a value for every movable stage — no stale wa_state).
    const wa = waStateForStage(stage);
    if (wa) update.wa_state = wa;

    const { error } = await supabase.from('leads').update(update).eq('id', leadId);
    if (error) throw error;

    // Push to Zoho. zoho_synced_at stays null (set above) so the reconcile cron retries
    // if this fails (e.g. the MQL+ picklist value isn't configured in Zoho yet).
    let zohoOk = true;
    if (zohoLeadId) {
      zohoOk = await updateZohoLead(zohoLeadId, { Lead_Stage: stage });
    }

    // Surface a partial result so the UI can warn instead of falsely reporting success.
    return NextResponse.json({
      success: true,
      stage,
      zohoWritten: zohoOk,
      ...(zohoLeadId && !zohoOk && { warning: `Saved locally; Zoho rejected stage "${stage}" (check the Lead_Stage picklist). Will retry on reconcile.` }),
    });
  } catch (error: any) {
    console.error('[Move Stage] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
