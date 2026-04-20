import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enqueueCampaignMessage } from '@/lib/queue/client';
import { generateCampaignReport } from '@/lib/campaigns/reports';

const PRIMARY_SENDER = '+917709333161';

export async function POST(request: Request) {
  try {
    const { rows, templateSid, templateName, campaignName, summary } = await request.json();

    if (!rows || rows.length === 0 || !campaignName || !templateSid || !templateName) {
      return NextResponse.json({ error: 'Missing required fields or rows' }, { status: 400 });
    }

    const matchedRows = rows.filter((r: any) => r.status === 'matched' && r.lead_id);

    if (matchedRows.length === 0) {
      return NextResponse.json({ error: 'No matched leads to send to.' }, { status: 400 });
    }

    // 1. Create zoho_upload_batch
    const { data: batch, error: bErr } = await supabase
      .from('zoho_upload_batches')
      .insert({
        filename: 'campaign_upload.csv',
        row_count: summary?.total || rows.length,
        matched: matchedRows.length,
        skipped: (summary?.skipped || 0)
      })
      .select()
      .single();

    if (bErr || !batch) {
      throw new Error(`Failed to create batch: ${bErr?.message}`);
    }

    // 2. Create campaign
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .insert({
        name: campaignName,
        template_variant_id: templateSid,
        segment_filters: { campaign_source: 'zoho_upload', zoho_upload_id: batch.id },
        status: 'running',
        source: 'zoho_upload',
        zoho_upload_id: batch.id
      })
      .select()
      .single();

    if (cErr || !campaign) {
      throw new Error(`Failed to create campaign: ${cErr?.message}`);
    }

    // Update batch to link to campaign
    await supabase.from('zoho_upload_batches').update({ campaign_id: campaign.id }).eq('id', batch.id);

    // 3. Insert campaign_leads
    const campaignLeadsToInsert = matchedRows.map((r: any) => ({
      campaign_id: campaign.id,
      lead_id: r.lead_id,
      status: 'pending'
    }));

    await supabase.from('campaign_leads').insert(campaignLeadsToInsert);

    // 4. Enqueue messages
    let enqueued = 0;
    for (const r of matchedRows) {
      try {
        await enqueueCampaignMessage({
          to: r.phone,
          from: PRIMARY_SENDER,
          contentSid: templateSid,
          templateName,
          leadId: r.lead_id,
          campaignId: campaign.id,
          contentVariables: JSON.stringify({ '1': r.name || 'there' })
        });
        enqueued++;
      } catch (e) {
        console.error(`[Zoho Upload] Error enqueuing for ${r.phone}:`, e);
      }
    }

    // 5. Initial report
    await generateCampaignReport(campaign.id);

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      enqueued
    });

  } catch (error: any) {
    console.error('[API] Commit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
