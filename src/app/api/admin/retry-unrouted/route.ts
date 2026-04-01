import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { evaluateLeadAction } from '@/lib/engine/rulesEngine';
import { Lead } from '@/lib/supabase';

export async function POST() {
  // Find all unrouted leads that never received an outbound message
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('wa_state', 'wa_unrouted')
    .is('wa_last_outbound_at', null)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ message: 'No unrouted leads to retry', retried: 0 });
  }

  console.log(`[Retry] Found ${leads.length} unrouted leads to retry.`);

  const results: { name: string; phone: string; status: 'ok' | 'error'; error?: string }[] = [];

  for (const lead of leads) {
    try {
      // Reset state to wa_pending so evaluateLeadAction can process it
      await supabase
        .from('leads')
        .update({ wa_state: 'wa_pending', updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      // IMPORTANT: Update the in-memory object too, because evaluateLeadAction 
      // passes lead.wa_state directly into the Logic Builder evaluator!
      const updatedLead = { ...lead, wa_state: 'wa_pending' };

      // Re-evaluate through the full rules engine
      await evaluateLeadAction(updatedLead as Lead, 'manual_retry');

      results.push({ name: lead.name || '—', phone: lead.phone_normalised, status: 'ok' });
    } catch (err: any) {
      console.error(`[Retry] Failed for lead ${lead.id}:`, err.message);
      results.push({ name: lead.name || '—', phone: lead.phone_normalised, status: 'error', error: err.message });
    }
  }

  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log(`[Retry] Complete: ${succeeded} retried, ${failed} failed.`);
  return NextResponse.json({ retried: succeeded, failed, total: leads.length, results });
}
