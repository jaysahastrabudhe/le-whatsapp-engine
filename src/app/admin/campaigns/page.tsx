import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export const revalidate = 0;

type CampaignLeadStats = {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  total: number;
};

export default async function CampaignsPage() {
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      campaign_leads (status)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return <div className="p-8 text-red-600">Error loading campaigns: {error.message}</div>;
  }

  function getStats(leads: { status: string }[]): CampaignLeadStats {
    return {
      total: leads.length,
      sent: leads.filter((l) => l.status === 'sent').length,
      delivered: leads.filter((l) => l.status === 'delivered').length,
      read: leads.filter((l) => l.status === 'read').length,
      replied: leads.filter((l) => l.status === 'replied').length,
      failed: leads.filter((l) => l.status === 'failed').length,
    };
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Campaign Manager</h1>
        <Link
          href="/admin/campaigns/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          + New Campaign
        </Link>
      </div>

      <div className="space-y-4">
        {campaigns?.map((camp) => {
          const stats = getStats(camp.campaign_leads || []);
          const replyRate = stats.total > 0
            ? ((stats.replied / stats.total) * 100).toFixed(1)
            : null;

          return (
            <div key={camp.id} className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
              {/* Header row */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{camp.name}</h3>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{camp.template_variant_id}</div>
                </div>
                <div className="flex items-center gap-3">
                  {replyRate !== null && (
                    <span className="text-sm font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded-full">
                      {replyRate}% replied
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider
                    ${camp.status === 'completed' ? 'bg-green-100 text-green-800' :
                      camp.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'}`}
                  >
                    {camp.status}
                  </span>
                </div>
              </div>

              {/* Stats bar */}
              {stats.total > 0 ? (
                <div className="grid grid-cols-5 gap-3 pt-2 border-t">
                  <StatCell label="Total" value={stats.total} />
                  <StatCell label="Sent" value={stats.sent} color="blue" />
                  <StatCell label="Delivered" value={stats.delivered} color="green" />
                  <StatCell label="Replied" value={stats.replied} color="purple" />
                  <StatCell label="Failed" value={stats.failed} color={stats.failed > 0 ? 'red' : undefined} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 pt-2 border-t">No leads tracked yet.</p>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-400">
                  Created {new Date(camp.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex items-center gap-3">
                  {camp.segment_filters && Object.keys(camp.segment_filters).length > 0 && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Segment: {JSON.stringify(camp.segment_filters)}
                    </span>
                  )}
                  <Link
                    href={`/admin/campaigns/${camp.id}`}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    View details →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {(!campaigns || campaigns.length === 0) && (
          <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
            No campaigns found.{' '}
            <Link href="/admin/campaigns/create" className="text-blue-600 hover:underline">
              Create one
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass =
    color === 'blue' ? 'text-blue-700' :
    color === 'green' ? 'text-green-700' :
    color === 'purple' ? 'text-purple-700' :
    color === 'red' ? 'text-red-600' :
    'text-gray-700';
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
