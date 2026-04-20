'use client';

import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function QueueCallButton({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleQueue = async () => {
    if (!confirm('Add this lead to the Call Queue manually?')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/queue-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId })
      });

      if (!res.ok) throw new Error('Failed to queue call');
      
      router.refresh();
      alert('Lead added to SLA Monitor.');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleQueue}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
      title="Add to Call Queue"
    >
      <PhoneCall size={12} className={loading ? 'animate-pulse' : ''} />
      {loading ? 'Adding...' : 'Queue Call'}
    </button>
  );
}
