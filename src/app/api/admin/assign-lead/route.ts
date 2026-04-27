import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(request: Request) {
  try {
    const { leadId, assignTo } = await request.json();
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const { error } = await supabase
      .from('leads')
      .update({ call_assigned_to: assignTo || null })
      .eq('id', leadId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
