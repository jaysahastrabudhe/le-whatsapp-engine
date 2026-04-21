import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const revalidate = 0;

function formatIST(ts: string) {
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  });
}

function toISTDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default async function UndeliveredDownloadsPage() {
  const { data: rows } = await supabase
    .from('csv_imports')
    .select('id, created_at, row_count, imported_by')
    .eq('type', 'failed_export')
    .order('created_at', { ascending: false });

  const downloads = rows || [];

  // Group by IST date for the daily view
  const byDay: Record<string, typeof downloads> = {};
  for (const r of downloads) {
    const d = toISTDate(r.created_at);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(r);
  }

  const totalDownloads = downloads.length;
  const totalContacts  = downloads.reduce((sum, r) => sum + (r.row_count || 0), 0);

  // Check today
  const todayIST = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  });
  const downloadedToday = byDay[todayIST]?.length > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="border-b pb-5">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">Control Hub</Link>
          <span className="text-gray-300">/</span>
          <Link href="/admin/reports" className="text-sm text-gray-400 hover:text-gray-600">Reports</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600 font-medium">Undelivered Downloads</span>
        </div>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Undelivered Downloads</h1>
            <p className="text-gray-500 mt-1">Full history of failed-message CSV exports from the engine.</p>
          </div>
          <a href="/api/admin/export-failed"
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Today&apos;s CSV
          </a>
        </div>
      </div>

      {/* Today's status callout */}
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${downloadedToday ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <span className={`text-2xl`}>{downloadedToday ? '✅' : '⚠️'}</span>
        <div>
          <p className={`font-semibold text-sm ${downloadedToday ? 'text-green-800' : 'text-red-800'}`}>
            {downloadedToday
              ? `Downloaded today — ${byDay[todayIST].length === 1 ? 'once' : `${byDay[todayIST].length} times`}, ${byDay[todayIST].reduce((s, r) => s + r.row_count, 0)} contacts`
              : 'Not yet downloaded today'}
          </p>
          <p className={`text-xs mt-0.5 ${downloadedToday ? 'text-green-600' : 'text-red-600'}`}>
            {downloadedToday ? 'Undelivered messages have been picked up for manual sending.' : 'Download and send manually via WhatsApp Desktop.'}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-gray-900">{totalDownloads}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Total Downloads</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-orange-600">{totalContacts}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Total Contacts Exported</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-gray-900">{Object.keys(byDay).length}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Days With Downloads</div>
        </div>
      </div>

      {/* Full history table */}
      {downloads.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center text-gray-400 shadow-sm">
          No downloads recorded yet.
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Download History</h2>
            <span className="text-xs text-gray-400">{downloads.length} entries</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500 uppercase tracking-wider bg-gray-50/60">
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Time (IST)</th>
                <th className="px-5 py-3 text-right">Contacts in CSV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {downloads.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">
                    {toISTDate(row.created_at)}
                    {toISTDate(row.created_at) === todayIST && (
                      <span className="ml-2 text-xs text-blue-500 font-normal">today</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                    {new Date(row.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-semibold ${row.row_count > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {row.row_count > 0 ? `${row.row_count} contacts` : 'Empty'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
