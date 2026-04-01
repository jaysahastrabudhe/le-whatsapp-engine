'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SlaResolveButton({ leadId }: { leadId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const router = useRouter();

  async function handleClick() {
    if (state !== 'idle') return;
    setState('loading');
    try {
      const res = await fetch('/api/admin/sla-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
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

  if (state === 'done') return <span className="text-xs text-gray-400">✓ Resolved</span>;
  if (state === 'error') return <span className="text-xs text-red-500">Failed</span>;

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="text-xs px-2.5 py-1 border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 rounded-md font-medium transition-colors"
    >
      {state === 'loading' ? '…' : '✓ Resolved'}
    </button>
  );
}
