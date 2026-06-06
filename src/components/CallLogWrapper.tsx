'use client';
import { useState } from 'react';
import CallLogModal from './CallLogModal';
import { PhoneCall, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CallLogWrapper({
  lead,
  queueType,
  noAnswerCount = 0,
  showMessage = false,
  defaultCaller,
}: {
  lead: any;
  queueType: 'call_queue' | 'discovery_call' | 'whatsapp_reply' | 'mql_outreach';
  noAnswerCount?: number;
  showMessage?: boolean;       // also render a "Log Message" button (e.g. MQL / Sharjeel)
  defaultCaller?: string;      // pre-select the caller (box owner)
}) {
  const [open, setOpen] = useState<null | 'call' | 'message'>(null);
  const router = useRouter();

  const callColor =
    queueType === 'discovery_call' ? 'bg-purple-600 hover:bg-purple-700'
    : queueType === 'mql_outreach' ? 'bg-amber-600 hover:bg-amber-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <>
      <div className="flex items-center gap-1.5 justify-end">
        <button
          onClick={() => setOpen('call')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors text-white ${callColor}`}
        >
          <PhoneCall size={14} />
          {queueType === 'discovery_call' ? 'Update' : 'Log Call'}
        </button>

        {showMessage && (
          <button
            onClick={() => setOpen('message')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors text-white bg-emerald-600 hover:bg-emerald-700"
          >
            <MessageSquare size={14} />
            Log Message
          </button>
        )}
      </div>

      {open && (
        <CallLogModal
          leadId={lead.id}
          zohoLeadId={lead.zoho_lead_id}
          leadName={lead.name || lead.phone_normalised}
          queueType={queueType}
          noAnswerCount={noAnswerCount}
          channel={open}
          defaultCaller={defaultCaller}
          onClose={() => setOpen(null)}
          onSuccess={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
