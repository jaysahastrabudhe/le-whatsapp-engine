import { getTwilioTemplates } from '@/lib/twilio/templates';
import RefreshTemplatesButton from '@/components/admin/RefreshTemplatesButton';
import CreateTemplateButton from '@/components/admin/CreateTemplateButton';

export const revalidate = 0;

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  pending:  'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
};

export default async function TemplatesPage() {
  const templates = await getTwilioTemplates().catch(() => []);

  const approved = templates.filter((t) => t.status === 'approved').length;
  const pending  = templates.filter((t) => t.status === 'pending').length;
  const rejected = templates.filter((t) => t.status === 'rejected').length;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">WhatsApp Templates</h1>
          <p className="text-gray-500 mt-1">Live from Twilio Content API · {templates.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTemplateButton />
          <RefreshTemplatesButton />
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-center min-w-[80px]">
          <div className="text-2xl font-bold text-green-700">{approved}</div>
          <div className="text-xs text-green-600 mt-0.5">Approved</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-4 py-3 text-center min-w-[80px]">
          <div className="text-2xl font-bold text-yellow-700">{pending}</div>
          <div className="text-xs text-yellow-600 mt-0.5">Pending</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-center min-w-[80px]">
          <div className="text-2xl font-bold text-red-700">{rejected}</div>
          <div className="text-xs text-red-600 mt-0.5">Rejected</div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse table-fixed">
          <colgroup>
            <col className="w-40" />
            <col />
            <col className="w-52" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-semibold text-gray-700">Template Name</th>
              <th className="p-4 font-semibold text-gray-700">Message Body</th>
              <th className="p-4 font-semibold text-gray-700">Content SID</th>
              <th className="p-4 font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.sid} className="border-b last:border-0 hover:bg-gray-50/50 align-top">
                <td className="p-4 font-medium text-gray-900 break-words">{t.name}</td>
                <td className="p-4 text-sm text-gray-600">
                  {t.body
                    ? <span className="italic">&ldquo;{t.body}&rdquo;</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="p-4 font-mono text-xs text-gray-500 break-all">{t.sid}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-gray-500">
                  No templates found. Check Twilio credentials or hit Refresh.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
