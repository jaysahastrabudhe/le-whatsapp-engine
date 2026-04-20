import { NextResponse } from 'next/server';
import { generateCampaignReport } from '@/lib/campaigns/reports';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const report = await generateCampaignReport(params.id);
    if (!report) {
      return NextResponse.json({ error: 'Campaign not found or report generation failed' }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('[API] Error regenerating report:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
