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
  dedupe_days?: number; // Global campaign deduplication window
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
  let query = buildQuery(segment);
  
  // Apply N-day Global Deduplication
  if (segment.dedupe_days && segment.dedupe_days > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - segment.dedupe_days);
    
    // Get lead IDs recently contacted via any campaign
    const { data: recentLeads } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .gte('created_at', cutoffDate.toISOString());
    
    if (recentLeads && recentLeads.length > 0) {
      const excludedIds = Array.from(new Set(recentLeads.map(r => r.lead_id)));
      // Supabase filter: not.in('id', [...])
      query = query.not('id', 'in', `(${excludedIds.join(',')})`);
    }
  }

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
  segment: CampaignSegmentFilters,
  launchConfig?: { status?: string, scheduled_at?: string }
) {
  const status = launchConfig?.status || 'running';
  const scheduledAt = launchConfig?.scheduled_at || null;

  // 1. Create campaign record
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .insert({
      name,
      template_variant_id: templateVariantId,
      segment_filters: segment,
      status: status,
      scheduled_at: scheduledAt,
      dedupe_days: segment.dedupe_days || 0,
      source: segment.campaign_source || 'supabase_segment',
      ...(segment.zoho_upload_id ? { zoho_upload_id: segment.zoho_upload_id } : {})
    })
    .select()
    .single();

  if (cErr || !campaign) {
    throw new Error('Failed to create campaign');
  }

  // If status is 'draft' or 'scheduled', we stop here.
  // The launcher cron will pick up 'scheduled' campaigns later.
  if (status === 'draft' || status === 'scheduled') {
    return { success: true, count: 0, campaignId: campaign.id, status };
  }

  return executeCampaignLaunch(campaign.id);
}

/**
 * The actual logic to fetch leads, apply dedupe, and enqueue messages.
 * Used for both immediate launch and scheduled launch.
 */
export async function executeCampaignLaunch(campaignId: string) {
  // Fetch campaign details
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();
  
  if (cErr || !campaign) throw new Error('Campaign not found');

  const segment = (campaign.segment_filters || {}) as CampaignSegmentFilters;
  const templateVariantId = campaign.template_variant_id;
  const templateName = campaign.template_name || 'unknown_template';

  let leads: any[] | null = null;

  if (campaign.source === 'zoho_upload') {
     // For Zoho uploads, campaign_leads are already created during commit.
     // Fetch leads linked to this campaign.
     const { data: clData } = await supabase
       .from('campaign_leads')
       .select('lead_id, leads(*)')
       .eq('campaign_id', campaign.id)
       .eq('status', 'pending');
     
     leads = (clData || []).map(d => d.leads).filter(Boolean);
  } else {
    // 2. Fetch matching leads with global dedupe
    let query = buildQuery(segment);
    
    // Apply N-day deduplication stored on campaign
    if (campaign.dedupe_days && campaign.dedupe_days > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - campaign.dedupe_days);
      const { data: recentLeads } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .gte('created_at', cutoffDate.toISOString())
        .neq('campaign_id', campaign.id); // Don't dedupe against itself if retrying
      
      if (recentLeads && recentLeads.length > 0) {
        const excludedIds = Array.from(new Set(recentLeads.map(r => r.lead_id)));
        query = query.not('id', 'in', `(${excludedIds.join(',')})`);
      }
    }

    const { data } = await query;
    leads = data;

    if (!leads || leads.length === 0) {
      await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
      return { success: true, count: 0, campaignId: campaign.id };
    }

    // Insert campaign_leads records for segment campaigns
    await supabase.from('campaign_leads').insert(
      leads.map((l) => ({ campaign_id: campaign.id, lead_id: l.id, status: 'pending' }))
    );
  }

  // 4. Enqueue to campaign queue
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

  // Ensure campaign is marked as running
  await supabase.from('campaigns').update({ status: 'running' }).eq('id', campaign.id);

  console.log(`[Campaign] "${campaign.name}" launched — ${enqueued}/${leads.length} leads enqueued.`);
  return { success: true, count: enqueued, campaignId: campaign.id };
}
