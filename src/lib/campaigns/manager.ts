import { supabase } from '@/lib/supabase';
import { enqueueCampaignMessage } from '@/lib/queue/client';

const PRIMARY_SENDER = '+917709333161';

export type CampaignSegmentFilters = {
  lead_source?: string;
  wa_hotness?: string;
  wa_state?: string;
  persona?: string;
  urgency?: string;
  lead_track?: string;
  campaign_source?: 'supabase' | 'zoho_upload';
  zoho_upload_id?: string;
};

function buildQuery(segment: CampaignSegmentFilters) {
  let query = supabase
    .from('leads')
    .select('id, name, phone_normalised, wa_opt_in, wa_state', { count: 'exact' })
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
  if (segment.wa_state) {
    query = query.eq('wa_state', segment.wa_state);
  }
  if (segment.persona) {
    query = query.eq('persona', segment.persona);
  }
  if (segment.urgency) {
    query = query.eq('urgency', segment.urgency);
  }
  if (segment.lead_track) {
    query = query.eq('lead_track', segment.lead_track);
  }
  
  return query;
}

export async function previewCampaignAudience(segment: CampaignSegmentFilters) {
  const query = buildQuery(segment);
  // Just fetch count
  const { count, error } = await query.range(0, 0);
  if (error) {
    console.error('[Campaign] Preview query failed:', error);
    return { count: 0 };
  }
  return { count: count || 0 };
}

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
      source: segment.campaign_source || 'supabase_segment',
      ...(segment.zoho_upload_id ? { zoho_upload_id: segment.zoho_upload_id } : {})
    })
    .select()
    .single();

  if (cErr || !campaign) {
    throw new Error('Failed to create campaign');
  }

  let leads: any[] | null = null;

  if (segment.campaign_source === 'zoho_upload') {
    // If it's a zoho upload, we don't query leads here; 
    // the upload commit route creates the campaign_leads directly and enqueues.
    // So this function should only be used for supabase_segment campaigns.
    // For zoho upload campaigns, we handle it in the commit route.
    console.warn('[Campaign] createAndLaunchCampaign called for zoho_upload. This should be handled in the commit route.');
    return { success: true, count: 0, campaignId: campaign.id };
  } else {
    // 2. Fetch matching leads
    const query = buildQuery(segment);
    const { data, error: lErr } = await query;
    leads = data;

    if (lErr || !leads || leads.length === 0) {
      await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
      return { success: true, count: 0, campaignId: campaign.id };
    }
  }

  // 3. Deduplication: Exclude leads that are already in this campaign
  // (In case of retry or weird manual re-trigger, though unlikely for a new campaign)
  // But wait, the campaign was just inserted! So no leads are in it yet.
  
  // 3. Insert campaign_leads records
  await supabase.from('campaign_leads').insert(
    leads.map((l) => ({ campaign_id: campaign.id, lead_id: l.id, status: 'pending' }))
  );

  // 4. Enqueue to campaign queue (rate-limited at 30/min by cron)
  // Bypass 2-message engine cooldown explicitly - campaigns queue logic assumes bypassing
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
