import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { leadId } = await request.json();

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    // Move to call_queued state
    const { error } = await supabase
      .from('leads')
      .update({
        wa_state: 'call_queued',
        wa_hotness: 'hot', // Force hot since a team member manually queued it
        zoho_synced_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Queue Call] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
