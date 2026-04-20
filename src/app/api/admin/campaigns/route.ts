import { NextResponse } from 'next/server';
import { createAndLaunchCampaign, CampaignSegmentFilters } from '@/lib/campaigns/manager';
import { generateCampaignReport } from '@/lib/campaigns/reports';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, templateSid, templateName, segment } = body;

    if (!name || !templateSid || !templateName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await createAndLaunchCampaign(name, templateSid, templateName, segment || {});
    
    // Generate initial report skeleton
    if (result.campaignId) {
      await generateCampaignReport(result.campaignId);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error creating campaign:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
