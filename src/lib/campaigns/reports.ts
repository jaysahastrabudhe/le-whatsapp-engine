import { supabase } from '@/lib/supabase';

export type CampaignReport = {
  generated_at: string;
  campaign_id: string;
  campaign_name: string;
  template_used: string;
  source: string;
  
  audience: {
    targeted: number;
    enqueued: number;
  };

  delivery: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    delivery_rate_pct: number;
    read_rate_pct: number;
  };

  replies: {
    total: number;
    reply_rate_pct: number;
    by_class: Record<string, number>;
    hot_leads_generated: number;
    warm_leads_generated: number;
  };

  errors: {
    by_code: Record<string, number>;
    top_error: string | null;
  };

  zoho_upload?: {
    total_rows: number;
    matched: number;
    skipped_not_in_db: number;
    skipped_no_phone: number;
    skipped_opted_out: number;
  };
};

export async function generateCampaignReport(campaignId: string): Promise<CampaignReport | null> {
  // 1. Fetch campaign
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (cErr || !campaign) {
    console.error('[Reports] Failed to fetch campaign for report:', cErr);
    return null;
  }

  // 2. Fetch audience stats from campaign_leads
  const { data: campaignLeads, error: clErr } = await supabase
    .from('campaign_leads')
    .select('status, lead_id')
    .eq('campaign_id', campaignId);

  const targeted = campaignLeads ? campaignLeads.length : 0;
  // If we had more granular tracking of skipped enqueues, we'd adjust this. 
  // For now, assume all pending/sent/delivered were enqueued.
  const enqueued = targeted; 

  // 3. Fetch delivery stats from messages table (JOIN leads conceptually, but we can just use the created_at > campaign.created_at filter on those lead_ids)
  // Wait, the best way to get exact campaign messages is matching lead_id AND the template_variant_id AND sent_at >= campaign.created_at
  // Or better, just count the statuses directly from messages since we don't have a campaign_id column on messages.
  
  const leadIds = campaignLeads?.map(cl => cl.lead_id) || [];
  
  let messages: any[] = [];
  if (leadIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('status, error_code, direction, wa_reply_class:leads(wa_reply_class), wa_hotness:leads(wa_hotness)')
      .in('lead_id', leadIds)
      .eq('template_variant_id', campaign.template_variant_id)
      .gte('sent_at', campaign.created_at);
      
    if (msgs) messages = msgs;
  }

  const outboundMsgs = messages.filter(m => m.direction === 'outbound');
  
  const sent = outboundMsgs.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read').length;
  const delivered = outboundMsgs.filter(m => m.status === 'delivered' || m.status === 'read').length;
  const read = outboundMsgs.filter(m => m.status === 'read').length;
  const failed = outboundMsgs.filter(m => m.status === 'failed').length;

  const delivery_rate_pct = sent > 0 ? parseFloat(((delivered / sent) * 100).toFixed(1)) : 0;
  const read_rate_pct = delivered > 0 ? parseFloat(((read / delivered) * 100).toFixed(1)) : 0;

  // Errors
  const by_code: Record<string, number> = {};
  for (const m of outboundMsgs) {
    if (m.status === 'failed' && m.error_code) {
      by_code[m.error_code] = (by_code[m.error_code] || 0) + 1;
    }
  }
  
  let top_error = null;
  let maxCount = 0;
  for (const [code, count] of Object.entries(by_code)) {
    if (count > maxCount) {
      maxCount = count;
      top_error = code;
    }
  }

  // 4. Replies
  // Any inbound message from these leads AFTER the campaign creation time
  let inboundMsgs: any[] = [];
  if (leadIds.length > 0) {
    const { data: inMsgs } = await supabase
      .from('messages')
      .select('lead_id, status')
      .in('lead_id', leadIds)
      .eq('direction', 'inbound')
      .gte('sent_at', campaign.created_at);
      
    if (inMsgs) inboundMsgs = inMsgs;
  }
  
  // Count unique leads who replied
  const repliedLeadIds = new Set(inboundMsgs.map(m => m.lead_id));
  const totalReplies = repliedLeadIds.size;
  const reply_rate_pct = delivered > 0 ? parseFloat(((totalReplies / delivered) * 100).toFixed(1)) : 0;

  // Hotness / Classes of those who replied
  const by_class: Record<string, number> = {};
  let hotCount = 0;
  let warmCount = 0;

  if (repliedLeadIds.size > 0) {
    const { data: repliedLeads } = await supabase
      .from('leads')
      .select('wa_reply_class, wa_hotness')
      .in('id', Array.from(repliedLeadIds));
      
    for (const l of repliedLeads || []) {
      if (l.wa_reply_class) {
        by_class[l.wa_reply_class] = (by_class[l.wa_reply_class] || 0) + 1;
      }
      if (l.wa_hotness === 'hot') hotCount++;
      if (l.wa_hotness === 'warm') warmCount++;
    }
  }

  // 5. Zoho Upload Stats (if applicable)
  let zoho_upload = undefined;
  if (campaign.source === 'zoho_upload' && campaign.zoho_upload_id) {
    const { data: uploadBatch } = await supabase
      .from('zoho_upload_batches')
      .select('*')
      .eq('id', campaign.zoho_upload_id)
      .single();
      
    if (uploadBatch) {
      // In the table it tracks matched and skipped, and row_count
      // Let's assume some reasons are derived or stored. For now, basic projection.
      zoho_upload = {
        total_rows: uploadBatch.row_count || 0,
        matched: uploadBatch.matched || 0,
        skipped_not_in_db: uploadBatch.skipped || 0, // Simplified
        skipped_no_phone: 0,
        skipped_opted_out: 0
      };
    }
  }

  const report: CampaignReport = {
    generated_at: new Date().toISOString(),
    campaign_id: campaignId,
    campaign_name: campaign.name,
    template_used: campaign.template_variant_id,
    source: campaign.source,
    
    audience: {
      targeted,
      enqueued
    },
    delivery: {
      sent,
      delivered,
      read,
      failed,
      delivery_rate_pct,
      read_rate_pct
    },
    replies: {
      total: totalReplies,
      reply_rate_pct,
      by_class,
      hot_leads_generated: hotCount,
      warm_leads_generated: warmCount
    },
    errors: {
      by_code,
      top_error
    },
    ...(zoho_upload ? { zoho_upload } : {})
  };

  // 6. Save back to campaign
  await supabase
    .from('campaigns')
    .update({ report })
    .eq('id', campaignId);

  return report;
}
