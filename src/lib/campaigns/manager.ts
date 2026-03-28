import { supabase } from '@/lib/supabase';
import { enqueueCampaignMessage } from '@/lib/queue/client';

const PRIMARY_SENDER = '+917709333161';

export type CampaignSegmentFilters = {
  lead_source?: string;
  wa_hotness?: string;
};

export async function createAndLaunchCampaign(
  name: string,
  templateVariantId: string,
  templateName: string,
  segment: CampaignSegmentFilters
) {
  // 1. Create campaign record
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .insert({
      name,
      template_variant_id: templateVariantId,
      segment_filters: segment,
      status: 'running',
    })
    .select()
    .single();

  if (cErr || !campaign) {
    throw new Error('Failed to create campaign');
  }

  // 2. Fetch matching leads — include name for contentVariables
  let query = supabase
    .from('leads')
    .select('id, name, phone_normalised, wa_opt_in, wa_state')
    .eq('wa_opt_in', true)
    .neq('wa_state', 'wa_closed')
    .neq('wa_state', 'invalid_number')
    .neq('wa_state', 'opted_out')
    .neq('wa_hotness', 'dead');

  if (segment.lead_source) {
    query = query.ilike('lead_source', `%${segment.lead_source}%`);
  }
  if (segment.wa_hotness) {
    query = query.eq('wa_hotness', segment.wa_hotness);
  }

  const { data: leads, error: lErr } = await query;
  if (lErr || !leads || leads.length === 0) {
    await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
    return { success: true, count: 0, campaignId: campaign.id };
  }

  // 3. Insert campaign_leads records
  await supabase.from('campaign_leads').insert(
    leads.map((l) => ({ campaign_id: campaign.id, lead_id: l.id, status: 'pending' }))
  );

  // 4. Enqueue to campaign queue (rate-limited at 30/min by cron)
  let enqueued = 0;
  for (const lead of leads) {
    try {
      await enqueueCampaignMessage({
        to:               lead.phone_normalised,
        from:             PRIMARY_SENDER,
        contentSid:       templateVariantId,
        templateName,
        leadId:           lead.id,
        campaignId:       campaign.id,
        contentVariables: JSON.stringify({ '1': lead.name || 'there' }),
      });
      enqueued++;
    } catch (err) {
      console.error(`[Campaign] Failed to enqueue ${lead.phone_normalised}:`, err);
    }
  }

  console.log(`[Campaign] "${name}" launched — ${enqueued}/${leads.length} leads enqueued.`);
  // Status stays 'running' — the process-queue cron marks it 'completed'
  // once all campaign_leads have been dispatched.

  return { success: true, count: enqueued, campaignId: campaign.id };
}
