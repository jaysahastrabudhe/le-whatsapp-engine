'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CampaignReport } from '@/lib/campaigns/reports';

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

export default function CampaignDetailClient({
  campaign,
  totalTargeted,
  sentCount,
  deliveredCount,
  readCount,
  failedCount,
  replies,
  replyRate
}: {
  campaign: any;
  totalTargeted: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  replies: any[];
  replyRate: string | null;
}) {
  const [activeTab, setActiveTab] = useState<'funnel' | 'report'>('funnel');
  const segment = campaign.segment_filters as Record<string, string> | null;
  const [reportData, setReportData] = useState<CampaignReport | null>(campaign.report || null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const handleRegenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/report`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to regenerate report');
      const data = await res.json();
      setReportData(data);
    } catch (e) {
      console.error(e);
      alert('Error regenerating report');
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/campaigns" className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
            ← Back to Campaigns
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mt-1 flex items-center gap-2">
            {campaign.source === 'zoho_upload' && <span title="Zoho Upload">📤</span>}
            {campaign.name}
          </h1>
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

      {/* Tabs */}
      <div className="border-b flex gap-4">
        <button 
          onClick={() => setActiveTab('funnel')} 
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'funnel' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
        >
          Delivery & Respondents
        </button>
        <button 
          onClick={() => setActiveTab('report')} 
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'report' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
        >
          Campaign Report
        </button>
      </div>

      {activeTab === 'funnel' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Funnel stats */}
          <div className="bg-white border rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">
              Delivery Funnel (Realtime)
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
              <div className="divide-y max-h-96 overflow-y-auto">
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
      )}

      {activeTab === 'report' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-gray-50 border rounded-lg p-4">
            <div className="text-sm text-gray-600">
              Report generated at:{' '}
              <span className="font-medium text-gray-900">
                {reportData ? formatIST(reportData.generated_at) : 'Never'}
              </span>
            </div>
            <button 
              onClick={handleRegenerateReport}
              disabled={generatingReport}
              className="px-3 py-1.5 bg-white border shadow-sm rounded text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {generatingReport ? 'Regenerating...' : '🔄 Regenerate'}
            </button>
          </div>

          {!reportData ? (
             <div className="text-center py-12 text-gray-400 border rounded-lg bg-white">
               No report generated yet. Click Regenerate.
             </div>
          ) : (
             <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border rounded-lg p-5 shadow-sm text-center">
                    <div className="text-sm text-gray-500 font-medium mb-1">Delivery Rate</div>
                    <div className="text-3xl font-bold text-gray-900">{reportData.delivery.delivery_rate_pct}%</div>
                    <div className="text-xs text-gray-400 mt-1">{reportData.delivery.delivered} delivered / {reportData.delivery.sent} sent</div>
                  </div>
                  <div className="bg-white border rounded-lg p-5 shadow-sm text-center">
                    <div className="text-sm text-gray-500 font-medium mb-1">Reply Rate</div>
                    <div className="text-3xl font-bold text-gray-900">{reportData.replies.reply_rate_pct}%</div>
                    <div className="text-xs text-gray-400 mt-1">{reportData.replies.total} replies / {reportData.delivery.delivered} delivered</div>
                  </div>
                  <div className="bg-white border rounded-lg p-5 shadow-sm text-center border-orange-100 bg-orange-50">
                    <div className="text-sm text-orange-600 font-medium mb-1">Hot Leads Gen</div>
                    <div className="text-3xl font-bold text-orange-600">{reportData.replies.hot_leads_generated}</div>
                    <div className="text-xs text-orange-500 mt-1">+ {reportData.replies.warm_leads_generated} warm leads</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Reply Breakdown */}
                  <div className="bg-white border rounded-lg shadow-sm p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Reply Classes</h3>
                    {Object.keys(reportData.replies.by_class).length === 0 ? (
                      <p className="text-sm text-gray-500">No replies tracked yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(reportData.replies.by_class).map(([cls, count]) => (
                           <div key={cls} className="flex justify-between items-center text-sm">
                             <span className={`px-2 py-0.5 rounded font-medium ${CLASS_COLORS[cls] || 'bg-gray-100 text-gray-600'}`}>{cls.replace('_', ' ')}</span>
                             <span className="font-medium">{count}</span>
                           </div>
                        ))}
                      </div>
                    )}
                  </div>

                   {/* Error Breakdown */}
                   <div className="bg-white border rounded-lg shadow-sm p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Failures</h3>
                    {Object.keys(reportData.errors.by_code).length === 0 ? (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded text-sm">
                        ✅ No delivery errors
                      </div>
                    ) : (
                      <div className="space-y-3 pt-2">
                        {reportData.errors.top_error && (
                           <div className="text-xs text-red-600 mb-2 font-medium">Top error: {reportData.errors.top_error}</div>
                        )}
                        {Object.entries(reportData.errors.by_code).map(([code, count]) => (
                           <div key={code} className="flex justify-between items-center text-sm border-b pb-1">
                             <span className="text-gray-600 font-mono">Error {code}</span>
                             <span className="font-bold text-red-600">{count}</span>
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Zoho Stats */}
                {reportData.zoho_upload && (
                  <div className="bg-white border rounded-lg shadow-sm p-5 border-blue-100 bg-blue-50/30">
                    <h3 className="font-semibold text-gray-900 mb-4">Zoho Upload Audit</h3>
                    <div className="grid grid-cols-4 gap-4 text-center">
                       <div>
                         <div className="text-2xl font-bold">{reportData.zoho_upload.total_rows}</div>
                         <div className="text-xs text-gray-500 uppercase">Rows Valid</div>
                       </div>
                       <div>
                         <div className="text-2xl font-bold text-green-600">{reportData.zoho_upload.matched}</div>
                         <div className="text-xs text-gray-500 uppercase">Matched & Target</div>
                       </div>
                       <div>
                         <div className="text-2xl font-bold text-red-500">{reportData.zoho_upload.skipped_not_in_db}</div>
                         <div className="text-xs text-gray-500 uppercase">Skipped</div>
                       </div>
                    </div>
                  </div>
                )}
             </div>
          )}
        </div>
      )}
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
