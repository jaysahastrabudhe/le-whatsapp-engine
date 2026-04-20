'use client';
import { useState } from 'react';
import CallLogModal from './CallLogModal';
import { PhoneCall } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CallLogWrapper({ lead, queueType }: { lead: any, queueType: 'call_queue' | 'discovery_call' }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors ${
          queueType === 'discovery_call' 
            ? 'bg-purple-600 hover:bg-purple-700 text-white' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        <PhoneCall size={14} />
        {queueType === 'discovery_call' ? 'Update' : 'Log Call'}
      </button>

      {open && (
        <CallLogModal
          leadId={lead.id}
          zohoLeadId={lead.zoho_lead_id}
          leadName={lead.name || lead.phone_normalised}
          queueType={queueType}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
