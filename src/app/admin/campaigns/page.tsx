import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export const revalidate = 0;

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

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Campaign Manager</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/campaigns/zoho-upload"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium transition-colors"
          >
            📤 Zoho Upload Campaign
          </Link>
          <Link
            href="/admin/campaigns/create"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            + New Campaign
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {campaigns?.map((camp) => {
          // Always use live campaign_leads counts — the stored report is only generated
          // at commit time (before any sends) and would show stale zeros.
          const leads = camp.campaign_leads || [];
          const total = leads.length;
          const sent = leads.filter((l: any) => l.status !== 'pending').length;
          const delivered = leads.filter((l: any) => l.status === 'delivered' || l.status === 'read').length;
          const replied = leads.filter((l: any) => l.status === 'replied').length;
          const failed = leads.filter((l: any) => l.status === 'failed').length;
          const replyRate: string | null = delivered > 0
            ? ((replied / delivered) * 100).toFixed(1)
            : (total > 0 ? null : null);

          return (
            <div key={camp.id} className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
              {/* Header row */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg flex items-center gap-2">
                    {camp.source === 'zoho_upload' && <span title="Zoho Upload">📤</span>}
                    {camp.name}
                  </h3>
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
                      camp.status === 'running'   ? 'bg-blue-100 text-blue-800' :
                      camp.status === 'scheduled' ? 'bg-amber-100 text-amber-800' :
                      camp.status === 'draft'     ? 'bg-gray-100 text-gray-500' :
                      'bg-gray-100 text-gray-800'}`}
                  >
                    {camp.status}
                  </span>
                </div>
              </div>

              {/* Scheduled Info */}
              {camp.status === 'scheduled' && camp.scheduled_at && (
                <div className="bg-amber-50 border border-amber-100 rounded p-2 text-sm text-amber-700 flex items-center gap-2">
                  <span>⏰ Scheduled to launch at:</span>
                  <span className="font-semibold">
                    {new Date(camp.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {/* Stats bar */}
              {total > 0 || camp.status === 'running' || camp.status === 'completed' ? (
                <div className="grid grid-cols-5 gap-3 pt-2 border-t">
                  <StatCell label="Total" value={total} />
                  <StatCell label="Sent" value={sent} color="blue" />
                  <StatCell label="Delivered" value={delivered} color="green" />
                  <StatCell label="Replied" value={replied} color="purple" />
                  <StatCell label="Failed" value={failed} color={failed > 0 ? 'red' : undefined} />
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
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded max-w-sm truncate whitespace-nowrap overflow-hidden">
                      {camp.source === 'zoho_upload' ? 'Segment: Zoho Export ' : 'Segment: '}{JSON.stringify(camp.segment_filters)}
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
