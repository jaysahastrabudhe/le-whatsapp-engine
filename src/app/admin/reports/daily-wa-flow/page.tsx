import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const revalidate = 0;

function istDayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const end   = new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();
  return { start, end };
}

const FLOW_TEMPLATES = [
  'wa_enquiry_cta',
  'wa_followup_1_v2',
  'wa_track_selector',
  'wa_mql_second',
  'wa_nurture_1',
  'wa_nurture_2',
  'wa_nurture_3',
];

const PIPELINE_STAGES: { state: string; label: string; color: string }[] = [
  { state: 'first_sent',           label: 'First touch sent',       color: 'blue'   },
  { state: 'followup_sent',        label: 'Follow-up sent',         color: 'indigo' },
  { state: 'track_selector_sent',  label: 'Track selector sent',    color: 'purple' },
  { state: 'wa_nurture',           label: 'In nurture',             color: 'teal'   },
  { state: 'replied',              label: 'Replied (pending)',       color: 'amber'  },
  { state: 'wa_hot',               label: 'Hot',                    color: 'green'  },
  { state: 'call_queued',          label: 'Call queued',            color: 'green'  },
  { state: 'call_follow_up',       label: 'Call follow-up',         color: 'green'  },
  { state: 'wa_sla_escalated',     label: 'SLA escalated',          color: 'orange' },
  { state: 'wa_manual_triage',     label: 'Manual triage',          color: 'orange' },
  { state: 'wa_pending',           label: 'Pending (send window)',  color: 'gray'   },
  { state: 'wa_unrouted',          label: 'Unrouted',               color: 'red'    },
  { state: 'wa_closed',            label: 'Closed / opted out',     color: 'red'    },
];

const TONE: Record<string, string> = {
  blue:   'text-blue-700',   indigo: 'text-indigo-700', amber:  'text-amber-700',
  purple: 'text-purple-700', teal:   'text-teal-700',   green:  'text-green-700',
  orange: 'text-orange-700', red:    'text-rose-700',   gray:   'text-gray-800',
};
const BG: Record<string, string> = {
  blue:   'bg-blue-50 border-blue-200',   indigo: 'bg-indigo-50 border-indigo-200',
  amber:  'bg-amber-50 border-amber-200', purple: 'bg-purple-50 border-purple-200',
  teal:   'bg-teal-50 border-teal-200',   green:  'bg-green-50 border-green-200',
  orange: 'bg-orange-50 border-orange-200', red:  'bg-rose-50 border-rose-200',
  gray:   'bg-gray-50 border-gray-200',
};

const BAR_COLOR: Record<string, string> = {
  blue: 'bg-blue-500', indigo: 'bg-indigo-500', amber: 'bg-amber-500',
  purple: 'bg-purple-500', teal: 'bg-teal-500', green: 'bg-green-500',
  orange: 'bg-orange-500', red: 'bg-rose-500', gray: 'bg-gray-400',
};

function Stat({ label, value, tone = 'gray' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${TONE[tone]}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default async function DailyWAFlowPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const today  = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const date   = params.date || today;
  const { start, end } = istDayRange(date);

  // ── New leads today ──────────────────────────────────────────────────────
  const { data: newLeads } = await supabase
    .from('leads')
    .select('id, wa_state, wa_last_outbound_at, wa_last_template')
    .gte('created_at', start).lte('created_at', end);

  const newLeadTotal   = (newLeads || []).length;
  const newLeadMsgd    = (newLeads || []).filter(l => l.wa_last_outbound_at).length;
  const newLeadPending = newLeadTotal - newLeadMsgd;

  // ── Outbound messages today ──────────────────────────────────────────────
  const { data: outboundMsgs } = await supabase
    .from('messages')
    .select('status, sent_at')
    .eq('direction', 'outbound')
    .gte('sent_at', start).lte('sent_at', end);

  const msgByStatus: Record<string, number> = {};
  for (const m of outboundMsgs || []) {
    msgByStatus[m.status] = (msgByStatus[m.status] || 0) + 1;
  }
  const totalOutbound = (outboundMsgs || []).length;
  const readPct   = totalOutbound ? Math.round(((msgByStatus.read || 0) / totalOutbound) * 100) : 0;
  const failedPct = totalOutbound ? Math.round(((msgByStatus.failed || 0) / totalOutbound) * 100) : 0;

  // ── Templates sent today (via wa_last_outbound_at proxy) ─────────────────
  const { data: templateLeads } = await supabase
    .from('leads')
    .select('wa_last_template, wa_state, wa_reply_class, wa_hotness')
    .gte('wa_last_outbound_at', start).lte('wa_last_outbound_at', end)
    .not('wa_last_template', 'is', null);

  const tplStats: Record<string, { sent: number; replied: number; hot: number }> = {};
  for (const l of templateLeads || []) {
    const t = l.wa_last_template as string;
    if (!tplStats[t]) tplStats[t] = { sent: 0, replied: 0, hot: 0 };
    tplStats[t].sent++;
    if (l.wa_reply_class && l.wa_reply_class !== '') tplStats[t].replied++;
    if (l.wa_hotness === 'hot' || l.wa_state === 'call_queued' || l.wa_state === 'wa_hot') tplStats[t].hot++;
  }

  // ── Inbound replies today ────────────────────────────────────────────────
  const { data: inbound } = await supabase
    .from('messages')
    .select('content')
    .eq('direction', 'inbound')
    .gte('sent_at', start).lte('sent_at', end);

  // ── Button taps today ────────────────────────────────────────────────────
  const { data: buttonTaps } = await supabase
    .from('lead_events')
    .select('payload')
    .eq('event_type', 'button_tap')
    .gte('created_at', start).lte('created_at', end);

  const tapCounts: Record<string, number> = {};
  for (const e of buttonTaps || []) {
    const btn = (e as any).payload?.buttonPayload || 'Unknown';
    tapCounts[btn] = (tapCounts[btn] || 0) + 1;
  }

  // ── Pipeline: leads with activity today (updated_at within day) ─────────
  const { data: activeLeads } = await supabase
    .from('leads')
    .select('wa_state')
    .gte('updated_at', start)
    .lte('updated_at', end);

  const pipelineCounts: Record<string, number> = {};
  for (const l of activeLeads || []) {
    const s = l.wa_state || 'unknown';
    pipelineCounts[s] = (pipelineCounts[s] || 0) + 1;
  }
  const pipelineTotal = (activeLeads || []).length;

  // ── All-time snapshot for context ────────────────────────────────────────
  const snapshotCounts: Record<string, number> = {};
  await Promise.all(
    PIPELINE_STAGES.map(async ({ state }) => {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('wa_state', state);
      snapshotCounts[state] = count ?? 0;
    })
  );
  const snapshotTotal = Object.values(snapshotCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin/reports" className="text-sm text-gray-400 hover:text-gray-600">← Reports</Link>
        <div className="flex items-end justify-between gap-4 mt-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Daily WhatsApp Flow</h1>
            <p className="text-sm text-gray-500 mt-1">New leads, messages sent, delivery health, and sequence pipeline.</p>
          </div>
          <form className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={date}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <button className="bg-gray-900 text-white px-3 py-1.5 rounded-md text-sm font-medium">View</button>
          </form>
        </div>
      </div>

      {/* Section 1: Today's activity */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Today&apos;s Leads</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="New leads" value={newLeadTotal} tone="blue" />
          <Stat label="Messaged" value={newLeadMsgd} tone="green" />
          <Stat label="Not yet messaged" value={newLeadPending} tone={newLeadPending > 0 ? 'red' : 'gray'} />
        </div>
        {newLeadPending > 0 && (
          <p className="text-xs text-rose-600 mt-2 font-medium">
            ⚠ {newLeadPending} lead{newLeadPending > 1 ? 's' : ''} created today without a first-touch message.
          </p>
        )}
      </section>

      {/* Section 2: Delivery health */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Outbound Delivery</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total sent" value={totalOutbound} tone="gray" />
          <Stat label="Read" value={msgByStatus.read || 0} tone="green" />
          <Stat label="Delivered" value={msgByStatus.delivered || 0} tone="blue" />
          <Stat label="Failed" value={msgByStatus.failed || 0} tone={( msgByStatus.failed || 0) > 0 ? 'red' : 'gray'} />
          <Stat label="Read rate" value={`${readPct}%`} tone={readPct >= 50 ? 'green' : 'amber'} />
        </div>
        {failedPct > 10 && (
          <p className="text-xs text-rose-600 mt-2 font-medium">
            ⚠ {failedPct}% failure rate today — check for bad numbers or delivery errors.
          </p>
        )}
      </section>

      {/* Section 3: Template activity today */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Templates Sent Today</h2>
        {Object.keys(tplStats).length === 0 ? (
          <p className="text-sm text-gray-400 italic">No messages sent today yet.</p>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-4 py-3 text-left">Template</th>
                  <th className="px-4 py-3 text-center">Sent</th>
                  <th className="px-4 py-3 text-center">Replied</th>
                  <th className="px-4 py-3 text-center">Hot</th>
                  <th className="px-4 py-3 text-center">Reply %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(tplStats)
                  .sort((a, b) => b[1].sent - a[1].sent)
                  .map(([name, s]) => {
                    const replyPct = s.sent ? Math.round((s.replied / s.sent) * 100) : 0;
                    const isFlow = FLOW_TEMPLATES.includes(name);
                    return (
                      <tr key={name} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs ${isFlow ? 'text-indigo-700 font-semibold' : 'text-gray-600'}`}>{name}</span>
                          {isFlow && <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded-full font-medium">flow</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-800">{s.sent}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{s.replied}</td>
                        <td className="px-4 py-3 text-center">
                          {s.hot > 0 ? <span className="text-green-700 font-semibold">{s.hot}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${replyPct >= 20 ? 'text-green-700' : replyPct >= 5 ? 'text-amber-700' : 'text-gray-400'}`}>
                            {replyPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 4: Button taps today */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Inbound Today — {(inbound || []).length} replies, {(buttonTaps || []).length} button taps
        </h2>
        {(buttonTaps || []).length === 0 ? (
          <p className="text-sm text-gray-400 italic">No button taps today.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(tapCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([btn, count]) => {
                const isHot = ['Call me today', 'INTERESTED', 'ENTERPRISE_LEADERSHIP', 'FAMILY_BUSINESS', 'VENTURE_BUILDER'].includes(btn);
                const isCold = ['Not now', 'Maybe later', 'DECIDED_AGAINST'].includes(btn);
                const chip = isHot ? 'bg-green-50 text-green-700 border-green-200' : isCold ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200';
                return (
                  <div key={btn} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${chip}`}>
                    {btn}
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Section 5a: Today's lead activity by state */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Today&apos;s Lead Activity — {pipelineTotal} leads updated
        </h2>
        {pipelineTotal === 0 ? (
          <p className="text-sm text-gray-400 italic">No lead activity recorded for this date.</p>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            {Object.entries(pipelineCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([state, count]) => {
                const stage = PIPELINE_STAGES.find(s => s.state === state);
                const color = stage?.color || 'gray';
                const label = stage?.label || state;
                const pct   = pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0;
                return (
                  <div key={state} className="flex items-center gap-4 px-5 py-3 border-b last:border-0 hover:bg-gray-50">
                    <div className="w-44 shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${BG[color]} ${TONE[color]}`}>{label}</span>
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${BAR_COLOR[color]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <div className="w-16 text-right">
                      <span className={`font-bold text-sm ${TONE[color]}`}>{count}</span>
                      <span className="text-gray-400 text-xs ml-1">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Section 5b: All-time pipeline snapshot */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Pipeline Snapshot (all time) — {snapshotTotal} leads
        </h2>
        <div className="bg-white border rounded-xl overflow-hidden">
          {PIPELINE_STAGES.filter(({ state }) => snapshotCounts[state] > 0).map(({ state, label, color }) => {
            const count = snapshotCounts[state] || 0;
            const pct   = snapshotTotal > 0 ? Math.round((count / snapshotTotal) * 100) : 0;
            return (
              <div key={state} className="flex items-center gap-4 px-5 py-3 border-b last:border-0 hover:bg-gray-50">
                <div className="w-44 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${BG[color]} ${TONE[color]}`}>{label}</span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${BAR_COLOR[color]}`} style={{ width: `${Math.max(pct, count > 0 ? 1 : 0)}%` }} />
                </div>
                <div className="w-20 text-right">
                  <span className={`font-bold text-sm ${TONE[color]}`}>{count}</span>
                  <span className="text-gray-400 text-xs ml-1">({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-gray-400 italic">
        "Today" = IST midnight to midnight. Template stats use wa_last_outbound_at as proxy.
        Today&apos;s lead activity = leads with updated_at within the day. Pipeline snapshot = live all-time counts.
      </p>
    </div>
  );
}
