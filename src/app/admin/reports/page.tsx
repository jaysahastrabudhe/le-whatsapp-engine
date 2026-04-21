import Link from 'next/link';

export default function ReportsPage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="border-b pb-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Control Hub</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600 font-medium">Reports</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-2">Reports</h1>
        <p className="text-gray-500 mt-1">Daily activity summaries for the team. Defaults to today (IST).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <Link href={`/admin/reports/daily-calls?date=${today}`} className="group block">
          <div className="bg-white border rounded-xl p-6 h-full shadow-sm hover:shadow-md hover:border-blue-500 transition-all">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">Daily Call Log</h3>
            <p className="text-gray-500 text-sm">All calls logged today — caller, contact status, next action, and notes. Breakdown by team member.</p>
          </div>
        </Link>

        <Link href={`/admin/reports/daily-inbound?date=${today}`} className="group block">
          <div className="bg-white border rounded-xl p-6 h-full shadow-sm hover:shadow-md hover:border-green-500 transition-all">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">Daily Inbound Messages</h3>
            <p className="text-gray-500 text-sm">All inbound WhatsApp replies today — classification, hotness, and lead details. Spot hot leads at a glance.</p>
          </div>
        </Link>

      </div>
    </div>
  );
}
