import { NextResponse } from 'next/server';
import { previewCampaignAudience, CampaignSegmentFilters } from '@/lib/campaigns/manager';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const segment: CampaignSegmentFilters = {};
  
  const lead_source = searchParams.get('lead_source');
  if (lead_source) segment.lead_source = lead_source;
  
  const wa_hotness = searchParams.get('wa_hotness');
  if (wa_hotness) segment.wa_hotness = wa_hotness;
  
  const wa_state = searchParams.get('wa_state');
  if (wa_state) segment.wa_state = wa_state;
  
  const persona = searchParams.get('persona');
  if (persona) segment.persona = persona;
  
  const urgency = searchParams.get('urgency');
  if (urgency) segment.urgency = urgency;
  
  const lead_track = searchParams.get('lead_track');
  if (lead_track) segment.lead_track = lead_track;

  try {
    const { count } = await previewCampaignAudience(segment);
    return NextResponse.json({ count });
  } catch (error: any) {
    console.error('[API] Error in preview-count:', error.message);
    return NextResponse.json({ error: 'Failed to preview count' }, { status: 500 });
  }
}
