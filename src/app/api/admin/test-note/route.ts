import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createZohoNote } from '@/lib/zoho';

// Temporary endpoint to verify Zoho note creation. Remove after testing.
export async function GET() {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, zoho_lead_id')
    .ilike('name', '%Jay Sahasrabuddhe%')
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.zoho_lead_id) return NextResponse.json({ error: 'No zoho_lead_id on this lead', lead }, { status: 400 });

  const ok = await createZohoNote(
    lead.zoho_lead_id,
    'Test Note — API Verification',
    `This is a test note to verify the Zoho Notes API integration is working.\nLead: ${lead.name}\nTimestamp: ${new Date().toISOString()}`
  );

  return NextResponse.json({ success: ok, lead: { name: lead.name, zoho_lead_id: lead.zoho_lead_id } });
}
