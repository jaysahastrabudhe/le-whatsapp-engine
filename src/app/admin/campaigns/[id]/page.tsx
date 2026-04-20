import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import CampaignDetailClient from './CampaignDetailClient';

export const revalidate = 0;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (!campaign) notFound();

  // Fetch all lead IDs in this campaign
  const { data: campaignLeads } = await supabase
    .from('campaign_leads')
    .select('lead_id, status, sent_at')
    .eq('campaign_id', id);

  const leadIds = (campaignLeads || []).map((cl) => cl.lead_id);
  const totalTargeted = leadIds.length;
  const sentCount = (campaignLeads || []).filter((cl) => cl.status !== 'pending').length;

  // Fetch outbound messages for these leads sent after campaign creation
  const { data: outboundMsgs } = leadIds.length > 0
    ? await supabase
        .from('messages')
        .select('lead_id, status, sent_at, delivered_at, read_at')
        .in('lead_id', leadIds)
        .eq('direction', 'outbound')
        .eq('template_variant_id', campaign.template_variant_id)
        .gte('sent_at', campaign.created_at)
    : { data: [] };

  const msgs = outboundMsgs || [];
  const deliveredCount = msgs.filter((m) => m.status === 'delivered' || m.status === 'read').length;
  const readCount = msgs.filter((m) => m.status === 'read').length;
  const failedCount = msgs.filter((m) => m.status === 'failed').length;

  // Fetch inbound replies from these leads after campaign creation
  const { data: inboundMsgs } = leadIds.length > 0
    ? await supabase
        .from('messages')
        .select('lead_id, content, sent_at, leads!lead_id(name, phone_normalised, wa_reply_class)')
        .in('lead_id', leadIds)
        .eq('direction', 'inbound')
        .gte('sent_at', campaign.created_at)
        .order('sent_at', { ascending: false })
    : { data: [] };

  const replies = (inboundMsgs || []) as Array<{
    lead_id: string;
    content: string | null;
    sent_at: string;
    leads: { name: string | null; phone_normalised: string; wa_reply_class: string | null } | null;
  }>;

  const replyRate = totalTargeted > 0
    ? ((replies.length / totalTargeted) * 100).toFixed(1)
    : null;

  return (
    <CampaignDetailClient 
      campaign={campaign}
      totalTargeted={totalTargeted}
      sentCount={sentCount}
      deliveredCount={deliveredCount}
      readCount={readCount}
      failedCount={failedCount}
      replies={replies}
      replyRate={replyRate}
    />
  );
}
