import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 0;

function formatIST(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const CLASS_COLORS: Record<string, string> = {
  interested:    'bg-green-100 text-green-800',
  fee_question:  'bg-blue-100 text-blue-800',
  not_now:       'bg-yellow-100 text-yellow-800',
  wrong_number:  'bg-red-100 text-red-800',
  stop:          'bg-red-200 text-red-900',
  other:         'bg-gray-100 text-gray-700',
};

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

  const segment = campaign.segment_filters as Record<string, string> | null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/campaigns" className="text-xs text-gray-400 hover:text-gray-600">
            ← Campaigns
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
            <span>Created {formatIST(campaign.created_at)}</span>
            {segment && Object.keys(segment).length > 0 && (
              <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                Segment: {Object.entries(segment).map(([k, v]) => `${k}=${v}`).join(', ')}
              </span>
            )}
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider
          ${campaign.status === 'completed' ? 'bg-green-100 text-green-800' :
            campaign.status === 'running'   ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-700'}`}>
          {campaign.status}
        </span>
      </div>

      {/* Funnel stats */}
      <div className="bg-white border rounded-lg shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">
          Delivery Funnel
        </h2>
        <div className="grid grid-cols-6 gap-2">
          <FunnelCell label="Targeted"  value={totalTargeted}  color="gray" />
          <FunnelArrow />
          <FunnelCell label="Sent"      value={sentCount}      color="blue" />
          <FunnelArrow />
          <FunnelCell label="Delivered" value={deliveredCount} color="indigo" />
          <FunnelArrow />
          <FunnelCell label="Read"      value={readCount}      color="purple" />
          <FunnelArrow />
          <FunnelCell label="Replied"   value={replies.length} color="green"
            sub={replyRate ? `${replyRate}%` : undefined} />
          <div /> {/* spacer */}
          <FunnelCell label="Failed"    value={failedCount}    color={failedCount > 0 ? 'red' : 'gray'} />
        </div>
      </div>

      {/* Template info */}
      <div className="bg-white border rounded-lg shadow-sm p-4 flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Template SID</span>
        <code className="text-xs font-mono bg-gray-50 px-2 py-1 rounded border">
          {campaign.template_variant_id}
        </code>
        {campaign.template_name && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-700">{campaign.template_name}</span>
          </>
        )}
      </div>

      {/* Respondents */}
      <div className="bg-white border rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Respondents
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
            </span>
          </h2>
        </div>

        {replies.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No replies received yet.
          </div>
        ) : (
          <div className="divide-y">
            {replies.map((r, i) => {
              const lead = r.leads;
              const cls = lead?.wa_reply_class;
              return (
                <div key={i} className="px-6 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 text-sm">
                        {lead?.name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        {lead?.phone_normalised}
                      </span>
                      {cls && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLASS_COLORS[cls] || 'bg-gray-100 text-gray-600'}`}>
                          {cls.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 italic">
                      &ldquo;{r.content || '(no text)'}&rdquo;
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap pt-0.5">
                    {formatIST(r.sent_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelCell({
  label, value, color, sub,
}: {
  label: string; value: number; color: string; sub?: string;
}) {
  const textColor =
    color === 'blue'   ? 'text-blue-700' :
    color === 'indigo' ? 'text-indigo-700' :
    color === 'purple' ? 'text-purple-700' :
    color === 'green'  ? 'text-green-700' :
    color === 'red'    ? 'text-red-600' :
    'text-gray-700';
  return (
    <div className="text-center py-2">
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs font-semibold text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function FunnelArrow() {
  return (
    <div className="flex items-center justify-center text-gray-300 text-lg font-light">→</div>
  );
}
