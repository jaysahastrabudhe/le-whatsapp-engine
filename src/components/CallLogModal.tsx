'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

const TEAM_MEMBERS = ['Jonathan', 'Jay', 'Sharjeel', 'Gargi'];

export default function CallLogModal({
  leadId,
  zohoLeadId,
  leadName,
  queueType,
  onClose,
  onSuccess
}: {
  leadId: string;
  zohoLeadId: string | null;
  leadName: string;
  queueType: 'call_queue' | 'discovery_call' | 'whatsapp_reply';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [caller, setCaller] = useState(TEAM_MEMBERS[0]);
  const [contactStatus, setContactStatus] = useState('answered');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState(queueType === 'discovery_call' ? 'ready_to_fill' : 'discovery_call');
  const [nextActionDate, setNextActionDate] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nextAction === 'followup_on_date' && !nextActionDate) {
      alert('Please select a follow-up date and time.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          zohoLeadId,
          caller,
          calledAt: new Date().toISOString(),
          contactStatus,
          notes,
          nextAction,
          nextActionDate: nextAction === 'followup_on_date' ? new Date(nextActionDate).toISOString() : null,
          currentQueue: queueType
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to log call');
      }

      onSuccess();
    } catch (error: any) {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Log Call: {leadName}</h2>
            <p className="text-xs text-gray-500 font-medium">Zoho Note will be created automatically.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Caller Name</label>
              <select
                required
                value={caller}
                onChange={e => setCaller(e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {(queueType === 'call_queue' || queueType === 'whatsapp_reply') && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Contact Status</label>
                <select
                  required
                  value={contactStatus}
                  onChange={e => {
                    setContactStatus(e.target.value);
                    if (e.target.value === 'no_answer') setNextAction('no_answer');
                  }}
                  className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="answered">Answered</option>
                  <option value="no_answer">No Answer</option>
                  <option value="call_back_later">Call Back Later</option>
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Call Notes <span className="text-gray-400 font-normal">(synced to Zoho)</span></label>
            <textarea
              required
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What did you discuss?"
              className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-4">
            <label className="text-sm font-bold text-blue-900">Next Action</label>
            <div className="space-y-2">
              {(queueType === 'call_queue' || queueType === 'whatsapp_reply') && contactStatus !== 'no_answer' && (
                <label className="flex items-center gap-3 p-2 border border-transparent hover:bg-blue-100 rounded cursor-pointer">
                  <input type="radio" name="action" value="discovery_call" checked={nextAction === 'discovery_call'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-800">Set up discovery call (Moves to Discovery Queue)</span>
                </label>
              )}

              {queueType === 'discovery_call' && (
                <label className="flex items-center gap-3 p-2 border border-transparent hover:bg-blue-100 rounded cursor-pointer">
                  <input type="radio" name="action" value="ready_to_fill" checked={nextAction === 'ready_to_fill'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-800">✅ Ready to Fill Form (Resolves lead)</span>
                </label>
              )}

              {contactStatus !== 'no_answer' && (
                <label className="flex items-center gap-3 p-2 border border-transparent hover:bg-blue-100 rounded cursor-pointer">
                  <input type="radio" name="action" value="followup_on_date" checked={nextAction === 'followup_on_date'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-800">Follow up later</span>
                </label>
              )}

              {contactStatus === 'no_answer' && (
                <label className="flex items-center gap-3 p-2 rounded opacity-50 cursor-not-allowed">
                  <input type="radio" readOnly checked className="w-4 h-4 text-blue-600 border-gray-300" />
                  <span className="text-sm font-medium text-gray-800">Lead stays in Call Queue</span>
                </label>
              )}
            </div>

            {nextAction === 'followup_on_date' && (
              <div className="pt-2 pl-7 animate-in fade-in slide-in-from-top-2 duration-200">
                <input
                  type="datetime-local"
                  required
                  value={nextActionDate}
                  onChange={e => setNextActionDate(e.target.value)}
                  className="w-full border border-blue-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-blue-600 mt-1">Lead will pop back into the queue on this date.</p>
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 border font-semibold text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving to Zoho...' : 'Log & Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
