import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normaliseIndianPhone } from '@/lib/utils/phoneNormaliser';

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const phoneNormalised = normaliseIndianPhone(phone);
    if (!phoneNormalised) {
      return NextResponse.json({ error: 'Invalid phone number. Enter a 10-digit Indian mobile number.' }, { status: 400 });
    }

    // Look up lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, name, phone_normalised, zoho_lead_id')
      .eq('phone_normalised', phoneNormalised)
      .single();

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead not found in Supabase database. Are they synced?' }, { status: 404 });
    }

    // Update lead state to call_queued
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        wa_state: 'call_queued',
        wa_hotness: 'hot', // Assume hot if they replied to manual message
        zoho_synced_at: null, // Reset to trigger reconcile
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, lead });
  } catch (error: any) {
    console.error('[Manual Reply] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
