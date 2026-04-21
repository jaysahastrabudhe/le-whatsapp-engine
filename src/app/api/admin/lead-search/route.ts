import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normaliseIndianPhone } from '@/lib/utils/phoneNormaliser';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Try phone normalisation — if it resolves, search by phone
  const asPhone = normaliseIndianPhone(q);

  let query = supabase
    .from('leads')
    .select('id, name, phone_normalised, wa_state, wa_hotness')
    .limit(10);

  if (asPhone) {
    query = query.eq('phone_normalised', asPhone);
  } else {
    query = query.ilike('name', `%${q}%`);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data || [] });
}
