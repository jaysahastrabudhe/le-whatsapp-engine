import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getZohoAccessToken } from '@/lib/zoho';

const ZOHO_BASE_URL = 'https://www.zohoapis.com/crm/v2';

// Temporary endpoint to verify Zoho note creation. Remove after testing.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const overrideId = searchParams.get('id'); // ?id=zoho_lead_id for direct testing

  let lead: { name: string; zoho_lead_id: string } | null = null;

  if (overrideId) {
    lead = { name: 'Manual override', zoho_lead_id: overrideId };
  } else {
    const { data: candidates } = await supabase
      .from('leads')
      .select('id, name, zoho_lead_id')
      .ilike('name', '%Jay%')
      .not('zoho_lead_id', 'is', null)
      .limit(5);

    if (!candidates || candidates.length === 0)
      return NextResponse.json({ error: 'No Jay leads with zoho_lead_id found' }, { status: 404 });

    lead = candidates[0] as { name: string; zoho_lead_id: string };
  }

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: 'Could not get Zoho token' }, { status: 500 });

  const url = `${ZOHO_BASE_URL}/Leads/${lead.zoho_lead_id}/Notes`;
  const payload = {
    data: [{
      Note_Title:   'Test Note — API Verification',
      Note_Content: `Zoho Notes API test.\nLead: ${lead.name}\nTimestamp: ${new Date().toISOString()}`,
    }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const zohoResponse = await res.json();

  return NextResponse.json({
    httpStatus: res.status,
    zohoResponse,
    lead,
    requestUrl: url,
  });
}
