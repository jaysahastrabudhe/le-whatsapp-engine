import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const FOLLOWUP_DEFAULTS = {
  rule5_enabled:    true,
  rule5_delay_hours: 24,
  rule5_template:   'wa_followup_1_v2',
  rule6_enabled:    true,
  rule6_delay_hours: 48,
  rule6a_template:  'wa_track_selector',
  rule6b_template:  'wa_mql_second',
};

export async function GET() {
  const { data, error } = await supabase
    .from('followup_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return NextResponse.json(FOLLOWUP_DEFAULTS);
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  const {
    rule5_enabled, rule5_delay_hours, rule5_template,
    rule6_enabled, rule6_delay_hours, rule6a_template, rule6b_template,
  } = body;

  const { error } = await supabase
    .from('followup_config')
    .upsert({
      id: 1,
      rule5_enabled,
      rule5_delay_hours: Number(rule5_delay_hours),
      rule5_template,
      rule6_enabled,
      rule6_delay_hours: Number(rule6_delay_hours),
      rule6a_template,
      rule6b_template,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
