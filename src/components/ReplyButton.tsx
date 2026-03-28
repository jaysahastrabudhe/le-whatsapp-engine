'use client';

import { useState } from 'react';

type Props = {
  phone: string;
  leadId: string;
  leadName: string;
};

export function ReplyButton({ phone, leadId, leadName }: Props) {
  const [open, setOpen]       = useState(false);
  const [message, setMessage] = useState('');
  const [state, setState]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errMsg, setErrMsg]   = useState('');

  function close() {
    setOpen(false);
    setState('idle');
    setMessage('');
    setErrMsg('');
  }

  async function handleSend() {
    if (!message.trim() || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/admin/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, leadId, message }),
      });
      const data = await res.json();
      if (res.ok) {
        setState('sent');
        setTimeout(close, 1800);
      } else {
        setErrMsg(data.error || 'Failed to send');
        setState('error');
      }
    } catch {
      setErrMsg('Network error — please try again');
      setState('error');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium transition-colors"
      >
        <span>↩</span> Reply
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 mx-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Reply to {leadName}</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{phone}</p>
              </div>
              <button
                onClick={close}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {/* Window badge */}
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              24-hour reply window is open — free-form message allowed
            </div>

            {/* Textarea */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
              placeholder="Type your message… (⌘+Enter to send)"
              rows={4}
              className="w-full border rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-emerald-300 outline-none"
            />

            {/* Feedback */}
            {state === 'error' && (
              <p className="text-xs text-red-600 font-medium">{errMsg}</p>
            )}
            {state === 'sent' && (
              <p className="text-xs text-emerald-600 font-semibold">Message sent!</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={close}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={state === 'sending' || state === 'sent' || !message.trim()}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {state === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
