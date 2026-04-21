import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const revalidate = 0;

function istDayRange(dateStr: string): { start: string; end: string } {
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

const CLASS_STYLES: Record<string, string> = {
  interested:   'bg-green-100 text-green-800',
  fee_question: 'bg-blue-100 text-blue-800',
  not_now:      'bg-yellow-100 text-yellow-800',
  wrong_number: 'bg-gray-100 text-gray-500',
  stop:         'bg-red-100 text-red-700',
  other:        'bg-purple-100 text-purple-700',
};

const CLASS_LABELS: Record<string, string> = {
  interested:   'Interested',
  fee_question: 'Fee Question',
  not_now:      'Not Now',
  wrong_number: 'Wrong Number',
  stop:         'Stop / Opt-Out',
  other:        'Other',
};

const HOTNESS_STYLES: Record<string, string> = {
  hot:  'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cold: 'bg-sky-100 text-sky-700',
};

export default async function DailyInboundPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const date = params.date || today;
  const { start, end } = istDayRange(date);

  const { data: msgs } = await supabase
    .from('messages')
    .select('id, content, sent_at, wa_reply_class, phone_normalised, lead_id, leads!lead_id(name, phone_normalised, wa_hotness, lead_stage, wa_state)')
    .eq('direction', 'inbound')
    .gte('sent_at', start)
    .lte('sent_at', end)
    .order('sent_at', { ascending: false });

  const rows = (msgs || []) as any[];

  // Summary stats
  const total = rows.length;
  const classCounts: Record<string, number> = {};
  for (const r of rows) {
    const cls = r.wa_reply_class || 'unclassified';
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }

  const hotLeads = rows.filter(r => r.leads?.wa_hotness === 'hot');

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
          <span className="text-sm text-gray-600 font-medium">Daily Inbound Messages</span>
        </div>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Daily Inbound Messages</h1>
            <p className="text-gray-500 mt-1">All inbound WhatsApp replies on {new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {/* Date nav */}
          <div className="flex items-center gap-2">
            <Link href={`/admin/reports/daily-inbound?date=${prevDate}`}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">← Prev</Link>
            <Link href={`/admin/reports/daily-inbound?date=${nextDate}`}
              className={`px-3 py-1.5 border rounded-lg text-sm transition-colors ${isToday ? 'text-gray-300 pointer-events-none' : 'text-gray-600 hover:bg-gray-50'}`}>Next →</Link>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-gray-900">{total}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Total Inbound</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-600">{classCounts['interested'] || 0}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Interested</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-red-500">{hotLeads.length}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Hot Leads</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-red-700">{classCounts['stop'] || 0}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Opt-Outs</div>
        </div>
      </div>

      {/* Classification Breakdown */}
      {Object.keys(classCounts).length > 0 && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">By Classification</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(classCounts).sort((a, b) => b[1] - a[1]).map(([cls, count]) => (
              <div key={cls} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${CLASS_STYLES[cls] || 'bg-gray-100 text-gray-600'}`}>
                <span className="font-semibold text-sm">{CLASS_LABELS[cls] || cls}</span>
                <span className="bg-white/60 text-xs font-bold rounded-full px-2 py-0.5">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hot leads callout */}
      {hotLeads.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-red-800 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Hot Leads — Action Required
          </h3>
          <div className="flex flex-wrap gap-3">
            {hotLeads.map(r => {
              const lead = r.leads as any;
              return (
                <div key={r.id} className="bg-white border border-red-200 rounded-lg px-3 py-2 text-sm">
                  <div className="font-semibold text-gray-900">{lead?.name || r.phone_normalised}</div>
                  <div className="text-xs text-gray-400 font-mono">{r.phone_normalised}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center text-gray-400 shadow-sm">
          No inbound messages on this date.
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Time (IST)</th>
                <th className="px-4 py-3 text-left">Lead</th>
                <th className="px-4 py-3 text-left">Classification</th>
                <th className="px-4 py-3 text-left">Hotness</th>
                <th className="px-4 py-3 text-left">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const lead = row.leads as any;
                return (
                  <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${lead?.wa_hotness === 'hot' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">
                      {formatIST(row.sent_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{lead?.name || '—'}</div>
                      <div className="text-xs text-gray-400 font-mono">{row.phone_normalised}</div>
                      {lead?.lead_stage && (
                        <span className="inline-block mt-0.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{lead.lead_stage}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.wa_reply_class ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CLASS_STYLES[row.wa_reply_class] || 'bg-gray-100 text-gray-600'}`}>
                          {CLASS_LABELS[row.wa_reply_class] || row.wa_reply_class}
                        </span>
                      ) : (
                        <span className="text-gray-300 italic text-xs">unclassified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead?.wa_hotness ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>
                          {lead.wa_hotness}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-sm">
                      <p className="line-clamp-2 text-xs">{row.content || <span className="text-gray-300 italic">No content</span>}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
