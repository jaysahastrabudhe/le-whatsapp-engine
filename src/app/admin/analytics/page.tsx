import { supabase } from '@/lib/supabase';
import { getApprovedTemplates } from '@/lib/twilio/templates';
import Link from 'next/link';
import { ReplyButton } from '@/components/ReplyButton';
import { MarkManualButton } from '@/components/MarkManualButton';
import { QueueCallButton } from '@/components/QueueCallButton';

export const revalidate = 0;

// ── Error code reference ──────────────────────────────────────────────────────
const ERROR_LABELS: Record<string, string> = {
  '63049': 'Meta: marketing category rejected',
  '63032': 'User opted out (STOP)',
  '21211': 'Invalid / non-WhatsApp number',
  '63016': 'Template not approved',
  '63033': 'WhatsApp not enabled on number',
  '30008': 'Unknown carrier error',
  '63003': 'Channel configuration error',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type TemplateStats = {
  sid: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  errorCodes: Record<string, number>;
};

type MsgRow = {
  id: string;
  lead_id: string | null;
  direction: string | null;
  phone_normalised: string | null;
  template_id: string | null;
  template_variant_id: string | null;
  content: string | null;
  status: string | null;
  error_code: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  leads: { name: string | null; wa_last_inbound_at: string | null; wa_hotness: string | null; wa_state: string | null } | null;
};

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ tab?: string; filter?: string; q?: string; page?: string }>;
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function AnalyticsPage({ searchParams }: Props) {
  const { tab = 'performance', filter = 'all', q = '', page = '1' } = await searchParams;
  const currentPage = Math.max(1, parseInt(page) || 1);

  // Build SID ↔ name lookup from live Twilio templates (Supabase-persisted)
  const liveTemplates = await getApprovedTemplates().catch(() => []);
  const SID_TO_NAME: Record<string, string> = Object.fromEntries(liveTemplates.map((t) => [t.sid, t.name]));
  const NAME_TO_SID: Record<string, string> = Object.fromEntries(liveTemplates.map((t) => [t.name, t.sid]));

  // ── TAB 2: MESSAGE LOG ────────────────────────────────────────────────────
  if (tab === 'messages') {
    const offset = (currentPage - 1) * PAGE_SIZE;

    // If searching, pre-fetch matching lead IDs by name
    let matchingLeadIds: string[] = [];
    if (q) {
      const { data: matchedLeads } = await supabase
        .from('leads')
        .select('id')
        .ilike('name', `%${q}%`);
      matchingLeadIds = (matchedLeads || []).map((l) => l.id);
    }

    // Build base query
    const applyFilters = (qb: any) => {
      if (filter === 'inbound') {
        qb = qb.eq('direction', 'inbound');
      } else if (filter === 'unrouted') {
        qb = qb.eq('direction', 'outbound').eq('status', 'unrouted');
      } else if (filter === 'manual') {
        qb = qb.eq('direction', 'outbound').eq('status', 'manual');
      } else if (filter !== 'all') {
        qb = qb.eq('direction', 'outbound').eq('status', filter);
      }
      if (q) {
        const orParts = [`phone_normalised.ilike.%${q}%`, `template_id.ilike.%${q}%`];
        if (matchingLeadIds.length > 0) {
          orParts.push(`lead_id.in.(${matchingLeadIds.join(',')})`);
        }
        qb = qb.or(orParts.join(','));
      }
      return qb;
    };

    // Count query
    const { count: totalCount } = await applyFilters(
      supabase.from('messages').select('*', { count: 'exact', head: true })
    );

    // Data query
    const { data, error } = await applyFilters(
      supabase
        .from('messages')
        .select('id, lead_id, direction, phone_normalised, template_id, template_variant_id, content, status, error_code, sent_at, delivered_at, read_at, leads!lead_id(name, wa_last_inbound_at, wa_hotness, wa_state)')
        .order('sent_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
    );

    if (error) {
      return <div className="p-8 text-red-600">Error loading messages: {error.message}</div>;
    }

    const rows = (data || []) as unknown as MsgRow[];
    const total = totalCount ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const windowCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Build URL helper preserving all params
    const msgUrl = (overrides: Record<string, string>) => {
      const params = new URLSearchParams({ tab: 'messages', filter, ...(q ? { q } : {}), page: String(currentPage), ...overrides });
      return `/admin/analytics?${params.toString()}`;
    };

    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader tab={tab} />

        {/* Search bar */}
        <form method="GET" action="/admin/analytics" className="flex gap-2">
          <input type="hidden" name="tab" value="messages" />
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, phone, or template…"
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700"
          >
            Search
          </button>
          {q && (
            <Link
              href={msgUrl({ q: '', page: '1' })}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-500 hover:border-gray-400"
            >
              Clear
            </Link>
          )}
        </form>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 items-center">
          {(['all', 'inbound', 'unrouted', 'failed', 'manual', 'delivered', 'read', 'sent'] as const).map((f) => (
            <Link
              key={f}
              href={msgUrl({ filter: f, page: '1' })}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Link>
          ))}
          <span className="ml-auto text-sm text-gray-400">
            {total} message{total !== 1 ? 's' : ''}{q ? ` matching "${q}"` : ''}
          </span>
          <a
            href="/api/admin/export-failed"
            className="ml-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
          >
            ⬇ Export Failed CSV
          </a>
        </div>

        {/* Message log table */}
        <div className="bg-white border rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">Lead</th>
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">Template / Message</th>
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">Error</th>
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">Time</th>
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">Hotness</th>
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap">SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isInbound = row.direction === 'inbound';
                const inWindow = !!(
                  row.leads?.wa_last_inbound_at &&
                  row.leads.wa_last_inbound_at > windowCutoff
                );
                const SLA_STATES = new Set(['call_queued', 'call_follow_up', 'discovery_call', 'wa_sla_escalated']);
                const isScheduled = !!(row.leads?.wa_state && SLA_STATES.has(row.leads.wa_state));

                return (
                  <tr key={row.id} className={`border-b hover:bg-gray-50/50 ${isInbound ? 'bg-indigo-50/30' : ''}`}>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{row.leads?.name || '—'}</div>
                      <div className="text-xs text-gray-400 font-mono">
                        {row.phone_normalised
                          ? row.phone_normalised.slice(0, 6) + '••••' + row.phone_normalised.slice(-4)
                          : '—'}
                      </div>
                    </td>
                    <td className="p-3 max-w-xs">
                      {isInbound ? (
                        <div className="text-gray-700 text-sm italic whitespace-pre-wrap break-words">
                          {row.content || '—'}
                        </div>
                      ) : (
                        <>
                          <div className="text-gray-800">
                            {row.template_id || SID_TO_NAME[row.template_variant_id || ''] || row.content || '—'}
                          </div>
                          {row.template_variant_id && (
                            <div className="text-xs text-gray-400 font-mono">
                              {row.template_variant_id.slice(0, 14)}…
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      {isInbound
                        ? <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">inbound</span>
                        : row.status === 'unrouted'
                          ? <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400 font-mono">null</span>
                          : <StatusBadge status={row.status} />
                      }
                    </td>
                    <td className="p-3">
                      {row.error_code ? (
                        <span className="text-xs text-orange-600 font-medium">
                          {row.error_code}
                          <span className="text-orange-400 font-normal">
                            {' '}— {ERROR_LABELS[row.error_code] ?? 'Unknown'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                      {row.sent_at ? formatTime(row.sent_at) : '—'}
                    </td>
                    <td className="p-3">
                      {row.leads?.wa_hotness ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.leads.wa_hotness === 'hot'  ? 'bg-red-100 text-red-700' :
                          row.leads.wa_hotness === 'warm' ? 'bg-orange-100 text-orange-700' :
                          row.leads.wa_hotness === 'cold' ? 'bg-blue-100 text-blue-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {row.leads.wa_hotness}
                        </span>
                      ) : <span className="text-gray-200 text-xs">—</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {isScheduled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Scheduled
                        </span>
                      ) : isInbound && inWindow && row.lead_id && row.phone_normalised ? (
                        <div className="flex items-center gap-2">
                          <span
                            title="24-hour reply window open"
                            className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"
                          />
                          <ReplyButton
                            phone={row.phone_normalised}
                            leadId={row.lead_id}
                            leadName={row.leads?.name || row.phone_normalised}
                          />
                          <QueueCallButton leadId={row.lead_id} />
                        </div>
                      ) : isInbound && !inWindow && row.lead_id ? (
                        <div className="flex items-center gap-2">
                          <QueueCallButton leadId={row.lead_id} />
                        </div>
                      ) : !isInbound && row.status === 'failed' && row.lead_id && row.phone_normalised ? (
                        <MarkManualButton
                          leadId={row.lead_id}
                          phoneNormalised={row.phone_normalised}
                        />
                      ) : (
                        <span className="text-gray-200 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    No messages found{q ? ` matching "${q}"` : filter !== 'all' ? ` with filter "${filter}"` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Link
              href={msgUrl({ page: String(currentPage - 1) })}
              className={`px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                currentPage <= 1
                  ? 'text-gray-300 border-gray-100 pointer-events-none'
                  : 'text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              ← Prev
            </Link>
            <span className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} · {total} total
            </span>
            <Link
              href={msgUrl({ page: String(currentPage + 1) })}
              className={`px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                currentPage >= totalPages
                  ? 'text-gray-300 border-gray-100 pointer-events-none'
                  : 'text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              Next →
            </Link>
          </div>
        )}

        <ErrorLegend />
      </div>
    );
  }

  // ── TAB 1: TEMPLATE PERFORMANCE ───────────────────────────────────────────
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('template_variant_id, status, error_code')
    .eq('direction', 'outbound')
    .not('template_variant_id', 'is', null);

  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('wa_last_template, wa_reply_class')
    .not('wa_last_template', 'is', null);

  if (msgError || leadError) {
    return (
      <div className="p-8 text-red-600">
        Error loading analytics: {msgError?.message || leadError?.message}
      </div>
    );
  }

  // Aggregate per SID
  const statsMap: Record<string, TemplateStats> = {};

  for (const msg of messages || []) {
    const sid = msg.template_variant_id;
    if (!sid) continue;
    if (!statsMap[sid]) {
      statsMap[sid] = {
        sid,
        name: SID_TO_NAME[sid] || sid,
        sent: 0, delivered: 0, read: 0, failed: 0, replied: 0,
        errorCodes: {},
      };
    }
    statsMap[sid].sent++;
    if (msg.status === 'delivered') statsMap[sid].delivered++;
    if (msg.status === 'read')      statsMap[sid].read++;
    if (msg.status === 'failed') {
      statsMap[sid].failed++;
      if (msg.error_code) {
        statsMap[sid].errorCodes[msg.error_code] =
          (statsMap[sid].errorCodes[msg.error_code] || 0) + 1;
      }
    }
  }

  // Reply attribution via wa_last_template on leads
  for (const lead of leads || []) {
    if (!lead.wa_reply_class || !lead.wa_last_template) continue;
    const sid = NAME_TO_SID[lead.wa_last_template];
    if (sid && statsMap[sid]) statsMap[sid].replied++;
  }

  const stats = Object.values(statsMap).sort((a, b) => b.sent - a.sent);

  const topError = (s: TemplateStats): string | null => {
    const entries = Object.entries(s.errorCodes);
    if (!entries.length) return null;
    const [code] = entries.sort((a, b) => b[1] - a[1])[0];
    return `${code} — ${ERROR_LABELS[code] ?? 'Unknown'}`;
  };

  const deliveryRate = (s: TemplateStats) =>
    s.sent > 0 ? (((s.delivered + s.read) / s.sent) * 100).toFixed(1) : '—';

  const replyRate = (s: TemplateStats) =>
    s.sent > 0 ? ((s.replied / s.sent) * 100).toFixed(1) : '—';

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader tab={tab} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Sends"
          value={stats.reduce((a, s) => a + s.sent, 0).toLocaleString()}
          color="blue"
        />
        <SummaryCard
          label="Delivered / Read"
          value={stats.reduce((a, s) => a + s.delivered + s.read, 0).toLocaleString()}
          color="green"
        />
        <SummaryCard
          label="Total Replies"
          value={stats.reduce((a, s) => a + s.replied, 0).toLocaleString()}
          color="purple"
        />
        <SummaryCard
          label="Failed"
          value={stats.reduce((a, s) => a + s.failed, 0).toLocaleString()}
          color="red"
        />
      </div>

      {/* Per-template table */}
      <div className="bg-white border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-semibold text-gray-700">Template</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Sent</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Delivered</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Read</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Replied</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Failed</th>
              <th className="p-4 font-semibold text-gray-700">Top Error</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Delivery %</th>
              <th className="p-4 font-semibold text-gray-700 text-right">Reply %</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.sid} className="border-b hover:bg-gray-50/50">
                <td className="p-4">
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{s.sid}</div>
                </td>
                <td className="p-4 text-right text-gray-700">{s.sent}</td>
                <td className="p-4 text-right text-gray-700">{s.delivered}</td>
                <td className="p-4 text-right text-gray-700">{s.read}</td>
                <td className="p-4 text-right text-gray-700">{s.replied}</td>
                <td className="p-4 text-right">
                  <span className={s.failed > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                    {s.failed}
                  </span>
                </td>
                <td className="p-4 max-w-[220px]">
                  {topError(s) ? (
                    <span className="text-xs text-orange-600 font-medium leading-snug">
                      {topError(s)}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <RateBadge value={deliveryRate(s)} thresholds={[60, 30]} />
                </td>
                <td className="p-4 text-right">
                  <RateBadge value={replyRate(s)} thresholds={[15, 5]} />
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-500">
                  No outbound messages recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ErrorLegend />
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function PageHeader({ tab }: { tab: string }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Analytics</h1>
      <p className="text-gray-500 mt-1">Message delivery and template performance.</p>
      <div className="flex gap-1 mt-4 border-b">
        {[
          { key: 'performance', label: 'Template Performance' },
          { key: 'messages',    label: 'Message Log' },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/admin/analytics?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    sent:      'bg-gray-100 text-gray-600',
    delivered: 'bg-blue-100 text-blue-700',
    read:      'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
    unrouted:  'bg-gray-100 text-gray-400',
    manual:    'bg-gray-800 text-white',
  };
  const s = status ?? 'unknown';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        styles[s] ?? 'bg-gray-100 text-gray-500'
      }`}
    >
      {s}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50   text-blue-700   border-blue-100',
    green:  'bg-green-50  text-green-700  border-green-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    red:    'bg-red-50    text-red-700    border-red-100',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-80">{label}</div>
    </div>
  );
}

function RateBadge({
  value,
  thresholds,
}: {
  value: string;
  thresholds: [number, number];
}) {
  if (value === '—') return <span className="text-gray-400">—</span>;
  const num = parseFloat(value);
  const color =
    num >= thresholds[0] ? 'text-green-600' :
    num >= thresholds[1] ? 'text-orange-500' :
    'text-red-500';
  return <span className={`font-semibold ${color}`}>{value}%</span>;
}

function ErrorLegend() {
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
      <p className="text-sm font-semibold text-amber-800 mb-2">Error Code Reference</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 text-xs text-amber-700">
        {Object.entries(ERROR_LABELS).map(([code, label]) => (
          <div key={code}>
            <span className="font-mono font-semibold">{code}</span> — {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  );
}
