'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  cron: string;
  label?: string;
  onDone?: () => void;
}

export default function TriggerCronButton({ cron, label = 'Sync Now', onDone }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [detail, setDetail] = useState<string | null>(null);

  async function trigger() {
    setState('loading');
    setDetail(null);
    try {
      const res = await fetch('/api/admin/trigger-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cron }),
      });
      const data = await res.json();
      if (data.success) {
        const count = data.result?.totalProcessed ?? data.result?.synced_count ?? null;
        setDetail(count !== null ? `${count} processed` : 'Done');
        setState('done');
        onDone?.();
      } else {
        setDetail(data.result?.error || 'Failed');
        setState('error');
      }
    } catch {
      setDetail('Network error');
      setState('error');
    }
    setTimeout(() => { setState('idle'); setDetail(null); }, 4000);
  }

  return (
    <button
      onClick={trigger}
      disabled={state === 'loading'}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium transition-colors
        ${state === 'done'    ? 'bg-green-50 border-green-300 text-green-700' :
          state === 'error'   ? 'bg-red-50 border-red-300 text-red-700' :
          state === 'loading' ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-wait' :
                                'bg-white border-gray-200 text-gray-600 hover:border-amber-400 hover:text-amber-700'}`}
    >
      <RefreshCw size={11} className={state === 'loading' ? 'animate-spin' : ''} />
      {state === 'loading' ? 'Syncing…' :
       state === 'done'    ? detail || 'Done ✓' :
       state === 'error'   ? detail || 'Error' :
       label}
    </button>
  );
}
