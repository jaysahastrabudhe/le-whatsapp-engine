import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const revalidate = 0;

function toISTDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function istDayRange(dateStr: string): { start: string; end: string } {
  // dateStr = YYYY-MM-DD in IST. IST = UTC+5:30
  const start = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  const end   = new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();
  return { start, end };
}

function formatIST(ts: string) {
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  });
}

const STATUS_STYLES: Record<string, string> = {
  answered:       'bg-green-100 text-green-800',
  no_answer:      'bg-red-100 text-red-800',
  call_back_later:'bg-yellow-100 text-yellow-800',
};

const ACTION_LABELS: Record<string, string> = {
  discovery_call:   'Discovery Call',
  ready_to_fill:    'Ready to Fill',
  followup_on_date: 'Follow Up Later',
  close_lead:       'Closed',
  no_answer:        'No Answer',
};

const ACTION_STYLES: Record<string, string> = {
  discovery_call:   'bg-purple-100 text-purple-800',
  ready_to_fill:    'bg-green-100 text-green-800',
  followup_on_date: 'bg-blue-100 text-blue-800',
  close_lead:       'bg-red-100 text-red-800',
  no_answer:        'bg-gray-100 text-gray-600',
};

export default async function DailyCallsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const date = params.date || today;
  const { start, end } = istDayRange(date);

  // History — last 14 days
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: historyRows } = await supabase
    .from('call_logs')
    .select('called_at')
    .gte('called_at', cutoff);
  const countByDay: Record<string, number> = {};
  for (const r of historyRows || []) countByDay[toISTDate(r.called_at)] = (countByDay[toISTDate(r.called_at)] || 0) + 1;
  const historyDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  });

  const { data: logs } = await supabase
    .from('call_logs')
    .select('id, caller, called_at, contact_status, notes, next_action, next_action_date, lead_id, leads!lead_id(name, phone_normalised, lead_stage, lead_status)')
    .gte('called_at', start)
    .lte('called_at', end)
    .order('called_at', { ascending: false });

  const rows = (logs || []) as any[];

  // Summary stats
  const totalCalls   = rows.length;
  const answered     = rows.filter(r => r.contact_status === 'answered').length;
  const noAnswer     = rows.filter(r => r.contact_status === 'no_answer').length;
  const callBack     = rows.filter(r => r.contact_status === 'call_back_later').length;

  const byCaller: Record<string, number> = {};
  for (const r of rows) byCaller[r.caller] = (byCaller[r.caller] || 0) + 1;

  const prevDate = new Date(new Date(`${date}T12:00:00+05:30`).getTime() - 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const nextDate = new Date(new Date(`${date}T12:00:00+05:30`).getTime() + 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const isToday = date === today;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="border-b pb-5">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">Control Hub</Link>
          <span className="text-gray-300">/</span>
          <Link href="/admin/reports" className="text-sm text-gray-400 hover:text-gray-600">Reports</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600 font-medium">Daily Call Log</span>
        </div>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Daily Call Log</h1>
            <p className="text-gray-500 mt-1">All calls logged on {new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {/* Date nav */}
          <div className="flex items-center gap-2">
            <Link href={`/admin/reports/daily-calls?date=${prevDate}`}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">← Prev</Link>
            <input type="date" defaultValue={date}
              onInput={undefined}
              className="border rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
              onChange={undefined} />
            <Link href={`/admin/reports/daily-calls?date=${nextDate}`}
              className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${isToday ? 'text-gray-300 pointer-events-none' : 'text-gray-600 hover:bg-gray-50'}`}>Next →</Link>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-gray-900">{totalCalls}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Total Calls</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-600">{answered}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Answered</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-red-500">{noAnswer}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">No Answer</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-yellow-500">{callBack}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Call Back Later</div>
        </div>
      </div>

      {/* By Caller */}
      {Object.keys(byCaller).length > 0 && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Calls by Team Member</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byCaller).sort((a, b) => b[1] - a[1]).map(([caller, count]) => (
              <div key={caller} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                <span className="font-semibold text-blue-900 text-sm">{caller}</span>
                <span className="bg-blue-200 text-blue-800 text-xs font-bold rounded-full px-2 py-0.5">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center text-gray-400 shadow-sm">
          No calls logged on this date.
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Time (IST)</th>
                <th className="px-4 py-3 text-left">Lead</th>
                <th className="px-4 py-3 text-left">Caller</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Next Action</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const lead = row.leads as any;
                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">
                      {formatIST(row.called_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{lead?.name || '—'}</div>
                      <div className="text-xs text-gray-400 font-mono">{lead?.phone_normalised || '—'}</div>
                      {lead?.lead_stage && (
                        <span className="inline-block mt-0.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{lead.lead_stage}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">{row.caller}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[row.contact_status] || 'bg-gray-100 text-gray-600'}`}>
                        {row.contact_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_STYLES[row.next_action] || 'bg-gray-100 text-gray-600'}`}>
                        {ACTION_LABELS[row.next_action] || row.next_action}
                      </span>
                      {row.next_action_date && (
                        <div className="text-xs text-gray-400 mt-0.5">{formatIST(row.next_action_date)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <p className="line-clamp-2 text-xs">{row.notes || <span className="text-gray-300 italic">No notes</span>}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 14-day history */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">14-Day History</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {historyDays.map((day) => {
            const count   = countByDay[day] || 0;
            const isSelected = day === date;
            const isToday    = day === today;
            const label = isToday ? 'Today' : new Date(`${day}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
            return (
              <Link key={day} href={`/admin/reports/daily-calls?date=${day}`}
                className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                <span className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>{label}</span>
                {count > 0
                  ? <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{count} call{count !== 1 ? 's' : ''}</span>
                  : <span className="text-gray-300 text-xs">No calls</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
