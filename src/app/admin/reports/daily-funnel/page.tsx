import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FUNNEL_STAGES, WA_COLD, WA_JUNK } from '@/lib/funnel';

export const revalidate = 0;

function istDayRange(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const end   = new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();
  return { start, end };
}

const MSG_STATUSES = ['message_sent', 'message_no_reply'];

// Bucket a set of call_logs rows for one owner.
function bucket(rows: { contact_status: string }[]) {
  const b = { positive: 0, negative: 0, noAnswer: 0, callBack: 0, msgSent: 0, msgNoReply: 0, calls: 0, messages: 0 };
  for (const r of rows) {
    switch (r.contact_status) {
      case 'answered':         b.positive++; b.calls++; break;
      case 'negative':         b.negative++; b.calls++; break;
      case 'no_answer':        b.noAnswer++; b.calls++; break;
      case 'call_back_later':  b.callBack++; b.calls++; break;
      case 'message_sent':     b.msgSent++; b.messages++; break;
      case 'message_no_reply': b.msgNoReply++; b.messages++; break;
    }
  }
  return b;
}

export default async function DailyFunnelReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const date = params.date || today;
  const { start, end } = istDayRange(date);

  // Today's call/message logs (for Sharjeel & Gargi results)
  const { data: logs } = await supabase
    .from('call_logs')
    .select('caller, contact_status, called_at')
    .gte('called_at', start).lte('called_at', end);
  const allLogs = logs || [];
  const sharjeel = bucket(allLogs.filter(l => l.caller === 'Sharjeel'));
  const gargi = bucket(allLogs.filter(l => l.caller === 'Gargi'));

  // Today's funnel-transition audit events (exact stage/outcome routing)
  const { data: transitions } = await supabase
    .from('lead_events')
    .select('payload, created_at')
    .eq('event_type', 'funnel_transition')
    .gte('created_at', start).lte('created_at', end);
  const tx = (transitions || []).map(t => (t as any).payload || {});
  const toSQL  = tx.filter(p => p.to_stage === 'SQL').length;
  const toMQLppp = tx.filter(p => p.to_stage === 'MQL+++').length;
  const toCold = tx.filter(p => p.to_wa_state === WA_COLD).length;
  const toJunk = tx.filter(p => p.to_wa_state === WA_JUNK).length;
  const gargiToSQL = tx.filter(p => p.to_stage === 'SQL' && p.caller === 'Gargi').length;

  // Jonathan — manual replies entered today, by source
  const { data: manualReplies } = await supabase
    .from('lead_events')
    .select('payload, created_at')
    .eq('event_type', 'manual_reply')
    .gte('created_at', start).lte('created_at', end);
  const mrBySource: Record<string, number> = {};
  for (const m of manualReplies || []) {
    const s = (m as any).payload?.source || 'Unknown';
    mrBySource[s] = (mrBySource[s] || 0) + 1;
  }
  const manualReplyTotal = (manualReplies || []).length;

  // Jonathan — inbound WhatsApp replies received today
  const { count: inboundMsgs } = await supabase
    .from('messages').select('*', { count: 'exact', head: true })
    .eq('direction', 'inbound').gte('sent_at', start).lte('sent_at', end);

  // Jay — current stage funnel snapshot
  const stageCounts: Record<string, number> = {};
  for (const stage of FUNNEL_STAGES) {
    const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('lead_stage', stage);
    stageCounts[stage] = count ?? 0;
  }

  const Stat = ({ label, value, tone = 'gray' }: { label: string; value: number | string; tone?: string }) => {
    const tones: Record<string, string> = {
      green: 'text-green-700', red: 'text-rose-700', blue: 'text-blue-700',
      amber: 'text-amber-700', purple: 'text-purple-700', gray: 'text-gray-800',
    };
    return (
      <div className="rounded-lg border bg-white px-4 py-3 text-center">
        <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
        <div className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">{label}</div>
      </div>
    );
  };

  // Full static class strings (Tailwind can't see runtime-interpolated class names).
  const DOT: Record<string, string> = { amber: 'bg-amber-500', purple: 'bg-purple-500', blue: 'bg-blue-500', gray: 'bg-gray-500' };
  const CHIP: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  const Section = ({ title, owner, color, children }: { title: string; owner: string; color: string; children: React.ReactNode }) => (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${DOT[color]}`} />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{title}</h2>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CHIP[color]}`}>{owner}</span>
      </div>
      {children}
    </section>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <Link href="/admin/reports" className="text-sm text-gray-400 hover:text-gray-600">← Reports</Link>
        <div className="flex items-end justify-between gap-4 mt-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Daily Funnel Report</h1>
            <p className="text-sm text-gray-500 mt-1">The daily 4-person count — Sharjeel, Gargi, Jonathan, Jay.</p>
          </div>
          <form className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={date}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <button className="bg-gray-900 text-white px-3 py-1.5 rounded-md text-sm font-medium">View</button>
          </form>
        </div>
      </div>

      {/* Sharjeel — MQL number & results */}
      <Section title="Sharjeel — MQL number &amp; results" owner="Sharjeel" color="amber">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Stat label="MQL in stage" value={stageCounts['MQL']} tone="amber" />
          <Stat label="Calls today" value={sharjeel.calls} />
          <Stat label="Messages" value={sharjeel.messages} tone="blue" />
          <Stat label="Positive" value={sharjeel.positive} tone="green" />
          <Stat label="Negative" value={sharjeel.negative} tone="red" />
          <Stat label="No answer" value={sharjeel.noAnswer} />
        </div>
      </Section>

      {/* Gargi — number called & results */}
      <Section title="Gargi — number called &amp; results" owner="Gargi" color="purple">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Stat label="Called today" value={gargi.calls} tone="purple" />
          <Stat label="Positive → MQL+++" value={gargi.positive} tone="green" />
          <Stat label="Negative → Junk" value={gargi.negative} tone="red" />
          <Stat label="No answer" value={gargi.noAnswer} />
          <Stat label="Call back" value={gargi.callBack} tone="amber" />
          <Stat label="Moved to SQL" value={gargiToSQL} tone="green" />
        </div>
      </Section>

      {/* Jonathan — messages sent manually & replies received */}
      <Section title="Jonathan — manual replies &amp; messages" owner="Jonathan" color="blue">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          <Stat label="Manual replies" value={manualReplyTotal} tone="blue" />
          {['Direct WhatsApp', 'Instagram', 'Web Chat', 'Email'].map(s => (
            <Stat key={s} label={s} value={mrBySource[s] || 0} />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          <Stat label="Inbound WA replies" value={inboundMsgs ?? 0} tone="blue" />
        </div>
      </Section>

      {/* Jay — roll-up */}
      <Section title="Jay — system roll-up" owner="Jay → Ankita" color="gray">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Today&apos;s outcomes</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="New → MQL+++" value={toMQLppp} tone="purple" />
          <Stat label="New SQL (won)" value={toSQL} tone="green" />
          <Stat label="New Cold" value={toCold} tone="blue" />
          <Stat label="New Junk" value={toJunk} tone="red" />
        </div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Funnel snapshot (current)</p>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {FUNNEL_STAGES.map(s => <Stat key={s} label={s} value={stageCounts[s]} tone="gray" />)}
        </div>
      </Section>

      <p className="text-xs text-gray-400 italic">
        Per-owner results come from call_logs (by caller, IST day). Stage transitions (MQL+++/SQL/Cold/Junk)
        are counted from dated funnel_transition events — accurate for activity logged after this report shipped.
      </p>
    </div>
  );
}
