import { getTwilioTemplates } from '@/lib/twilio/templates';
import RefreshTemplatesButton from '@/components/admin/RefreshTemplatesButton';
import CreateTemplateButton from '@/components/admin/CreateTemplateButton';

export const revalidate = 0;

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  pending:  'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
};

const TYPE_LABEL: Record<string, string> = {
  'twilio/text':            'Text',
  'twilio/quick-reply':     'Quick Reply',
  'twilio/call-to-action':  'Call to Action',
  'twilio/media':           'Media',
};

const BUTTON_STYLE: Record<string, string> = {
  'QUICK_REPLY':    'bg-blue-50 text-blue-700 border-blue-200',
  'URL':            'bg-purple-50 text-purple-700 border-purple-200',
  'PHONE_NUMBER':   'bg-green-50 text-green-700 border-green-200',
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

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.sid} className="bg-white border rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="flex items-start gap-4 p-4">
              {/* Left: name + type + SID */}
              <div className="w-48 shrink-0">
                <div className="font-semibold text-gray-900 break-words text-sm">{t.name}</div>
                {t.templateType && (
                  <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {TYPE_LABEL[t.templateType] ?? t.templateType}
                  </div>
                )}
                <div className="font-mono text-[10px] text-gray-400 break-all mt-1">{t.sid}</div>
              </div>

              {/* Middle: preview bubble */}
              <div className="flex-1 min-w-0">
                {/* Media thumbnail */}
                {t.mediaUrl && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-gray-200 inline-flex items-center gap-2 px-3 py-2 bg-gray-50 text-xs text-gray-500">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <a href={t.mediaUrl} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline max-w-xs">
                      {t.mediaUrl.split('/').pop() ?? 'media'}
                    </a>
                  </div>
                )}

                {/* Message body */}
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-100">
                  {t.body
                    ? t.body
                    : <span className="text-gray-400 italic">No body text</span>}
                </div>

                {/* Buttons */}
                {t.buttons && t.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {t.buttons.map((btn, i) => (
                      <div
                        key={i}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium ${BUTTON_STYLE[btn.type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}
                      >
                        {btn.type === 'URL' && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        )}
                        {btn.type === 'PHONE_NUMBER' && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        )}
                        {btn.type === 'QUICK_REPLY' && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                        )}
                        <span>{btn.title}</span>
                        {btn.url && <span className="text-[10px] opacity-60 truncate max-w-[120px]">{btn.url}</span>}
                        {btn.phone && <span className="text-[10px] opacity-60">{btn.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: status */}
              <div className="shrink-0">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {t.status}
                </span>
              </div>
            </div>
          </div>
        ))}

        {templates.length === 0 && (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-500 shadow-sm">
            No templates found. Check Twilio credentials or hit Refresh.
          </div>
        )}
      </div>
    </div>
  );
}
