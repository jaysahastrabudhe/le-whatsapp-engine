import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { executeCampaignLaunch } from '@/lib/campaigns/manager';

export const revalidate = 0;

/**
 * Scheduled Campaign Launcher Cron
 * Runs every 15-30 minutes (via Vercel Cron)
 * Finds 'scheduled' campaigns that are due and launches them.
 */
export async function GET(request: Request) {
  // Simple auth check via header (standard for our crons)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date().toISOString();
    
    // 1. Find due campaigns
    const { data: dueCampaigns, error } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (error) throw error;

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return NextResponse.json({ message: 'No campaigns due for launch.' });
    }

    console.log(`[Cron:Launcher] Found ${dueCampaigns.length} campaigns to launch.`);

    const results = [];
    for (const campaign of dueCampaigns) {
      try {
        console.log(`[Cron:Launcher] Launching campaign: ${campaign.name} (${campaign.id})`);
        const res = await executeCampaignLaunch(campaign.id);
        results.push({ id: campaign.id, name: campaign.name, success: true, count: res.count });
      } catch (err: any) {
        console.error(`[Cron:Launcher] Failed to launch ${campaign.id}:`, err.message);
        results.push({ id: campaign.id, name: campaign.name, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      processed: dueCampaigns.length,
      results
    });

  } catch (error: any) {
    console.error('[Cron:Launcher] Critical Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
