'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  leadId: string;
  phoneNormalised: string;
};

export function MarkManualButton({ leadId, phoneNormalised }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const router = useRouter();

  async function handleClick() {
    if (state !== 'idle') return;
    setState('loading');
    try {
      const res = await fetch('/api/admin/mark-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, phoneNormalised }),
      });
      if (res.ok) {
        setState('done');
        router.refresh();
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium">
        ✓ Marked
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
        Failed
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-900 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
    >
      {state === 'loading' ? '…' : '✎ Manual'}
    </button>
  );
}
