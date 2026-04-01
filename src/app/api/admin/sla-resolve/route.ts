import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const { leadId } = await request.json();

  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('leads')
    .update({
      wa_state:                 'wa_sla_resolved',
      wa_human_response_due_at: null,
      updated_at:               new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
