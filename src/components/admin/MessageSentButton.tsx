'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';

// One-click "Message Sent — awaiting reply" for Sharjeel's MQL leads.
export default function MessageSentButton({ leadId, caller = 'Sharjeel' }: { leadId: string; caller?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function click() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/mark-messaged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, caller }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      router.refresh();
    } catch (e: any) {
      alert(e.message); setBusy(false);
    }
  }
  return (
    <button onClick={click} disabled={busy} title="Mark message sent — awaiting reply"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50">
      <Send size={13} /> Message Sent
    </button>
  );
}
