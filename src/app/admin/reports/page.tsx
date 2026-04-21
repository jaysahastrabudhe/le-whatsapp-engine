import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const revalidate = 0;

function toISTDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function last14Days(): string[] {
  const days: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  }
  return days;
}

function groupByDay(rows: any[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r[field]) {
    const d = toISTDate(r[field]);
    out[d] = (out[d] || 0) + 1;
  }
  return out;
}

function formatDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today';
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}

export default async function ReportsPage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();

  const [callsRes, inboundRes, downloadsRes] = await Promise.all([
    supabase.from('call_logs').select('called_at').gte('called_at', cutoff),
    supabase.from('messages').select('sent_at').eq('direction', 'inbound').gte('sent_at', cutoff),
    supabase.from('csv_imports').select('created_at, row_count').eq('type', 'failed_export').order('created_at', { ascending: false }),
  ]);

  const callsByDay    = groupByDay(callsRes.data || [], 'called_at');
  const inboundByDay  = groupByDay(inboundRes.data || [], 'sent_at');

  // Downloads by day — keep latest row_count per day
  const downloadsByDay: Record<string, number> = {};
  for (const r of downloadsRes.data || []) {
    const d = toISTDate(r.created_at);
    if (!downloadsByDay[d]) downloadsByDay[d] = r.row_count; // first = most recent per day
  }

  const days = last14Days();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="border-b pb-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Control Hub</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600 font-medium">Reports</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-2">Reports</h1>
        <p className="text-gray-500 mt-1">Daily activity summaries for the team.</p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href={`/admin/reports/daily-calls?date=${today}`} className="group block">
          <div className="bg-white border rounded-xl p-6 h-full shadow-sm hover:shadow-md hover:border-blue-500 transition-all">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">Daily Call Log</h3>
            <p className="text-gray-500 text-sm">Caller, contact status, next action, notes. Breakdown by team member.</p>
          </div>
        </Link>

        <Link href={`/admin/reports/daily-inbound?date=${today}`} className="group block">
          <div className="bg-white border rounded-xl p-6 h-full shadow-sm hover:shadow-md hover:border-green-500 transition-all">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-green-600 transition-colors">Daily Inbound</h3>
            <p className="text-gray-500 text-sm">Inbound WhatsApp replies, classification, hotness, hot lead callouts.</p>
          </div>
        </Link>

        <Link href="/admin/reports/undelivered-downloads" className="group block">
          <div className="bg-white border rounded-xl p-6 h-full shadow-sm hover:shadow-md hover:border-orange-500 transition-all">
            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-orange-600 transition-colors">Undelivered Downloads</h3>
            <p className="text-gray-500 text-sm">History of failed-message CSV downloads — date, time, and contact count.</p>
          </div>
        </Link>
      </div>

      {/* 14-day History Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">14-Day Activity Log</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500 uppercase tracking-wider bg-gray-50/60">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-center">Calls Logged</th>
              <th className="px-5 py-3 text-center">Inbound Messages</th>
              <th className="px-5 py-3 text-center">CSV Downloaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {days.map((day) => {
              const calls    = callsByDay[day] || 0;
              const inbound  = inboundByDay[day] || 0;
              const download = downloadsByDay[day];
              const isToday  = day === today;
              return (
                <tr key={day} className={`hover:bg-gray-50 transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    {formatDayLabel(day, today)}
                    {isToday && <span className="ml-2 text-xs text-blue-500 font-normal">today</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {calls > 0
                      ? <Link href={`/admin/reports/daily-calls?date=${day}`} className="text-blue-600 font-semibold hover:underline">{calls}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {inbound > 0
                      ? <Link href={`/admin/reports/daily-inbound?date=${day}`} className="text-green-600 font-semibold hover:underline">{inbound}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {download != null
                      ? <span className="inline-flex items-center gap-1 text-orange-600 font-semibold"><span className="text-green-500">✓</span>{download} contacts</span>
                      : <span className="text-red-300 text-xs font-medium">Not downloaded</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
