'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ManualReplyForm() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{text: string; type: 'success' | 'error'} | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/manual-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to add reply');

      setMessage({ text: `Successfully added ${data.lead?.name || 'Lead'} to Call Queue.`, type: 'success' });
      setPhone('');
      router.refresh();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-end shadow-sm border-blue-200">
      <div className="flex-1 space-y-1 w-full">
         <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Manual Reply Entry</h2>
         <p className="text-xs text-gray-500 pb-2">Someone replied to an old/failed message? Enter their number here to drop them directly into the Call Queue.</p>
         <form onSubmit={handleSubmit} className="flex gap-3 relative">
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210 (10 digits)"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading || !phone}
              className="bg-gray-900 text-white px-5 py-2 rounded-md font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add to Queue'}
            </button>
         </form>
         {message && (
           <p className={`text-xs font-medium mt-2 ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
             {message.text}
           </p>
         )}
      </div>
    </div>
  );
}
