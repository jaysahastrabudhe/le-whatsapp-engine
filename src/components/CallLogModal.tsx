'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const TEAM_MEMBERS = ['Jonathan', 'Jay', 'Sharjeel', 'Gargi'];

const LEAD_STAGES  = ['Lead', 'MQL', 'SQL', 'Selection', 'Closing'];
const LEAD_STATUSES = [
  'Attempted to Contact', 'Contact in Future', 'Contacted',
  'Junk Lead', 'Lost Lead', 'Not Contacted', 'Pre-Qualified',
  'Not Qualified', 'Lead Push Success', 'Hot', 'Cold', 'Warm',
];

type QueueType = 'call_queue' | 'discovery_call' | 'whatsapp_reply' | 'mql_outreach';

// Pre-populate Lead Stage + Status based on queue + next action
function getZohoDefaults(queue: QueueType, action: string): { stage: string; status: string } {
  if (action === 'discovery_call') return { stage: 'SQL',  status: 'Contacted' };
  if (action === 'ready_to_fill')  return { stage: 'SQL',  status: 'Contacted' };
  if (action === 'close_lead')     return { stage: 'Lead', status: 'Not Qualified' };
  if (action === 'no_answer' || action === 'followup_on_date') {
    if (queue === 'mql_outreach') return { stage: 'MQL', status: 'Attempted to Contact' };
    return { stage: '', status: '' };
  }
  return { stage: '', status: '' };
}

export default function CallLogModal({
  leadId, zohoLeadId, leadName, queueType, onClose, onSuccess,
}: {
  leadId: string;
  zohoLeadId: string | null;
  leadName: string;
  queueType: QueueType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [caller, setCaller] = useState(TEAM_MEMBERS[0]);
  const [contactStatus, setContactStatus] = useState('answered');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState(
    queueType === 'discovery_call' ? 'ready_to_fill' : 'discovery_call'
  );
  const [nextActionDate, setNextActionDate] = useState('');
  const [leadStage, setLeadStage] = useState('');
  const [leadStatus, setLeadStatus] = useState('');

  // Auto-populate Zoho fields when next action or contact status changes
  useEffect(() => {
    const effectiveAction = contactStatus === 'no_answer' ? 'no_answer' : nextAction;
    const defaults = getZohoDefaults(queueType, effectiveAction);
    setLeadStage(defaults.stage);
    setLeadStatus(defaults.status);
  }, [nextAction, contactStatus, queueType]);

  const handleContactStatusChange = (val: string) => {
    setContactStatus(val);
    if (val === 'no_answer') setNextAction('no_answer');
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
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
          leadId, zohoLeadId, caller,
          calledAt: new Date().toISOString(),
          contactStatus, notes, nextAction,
          nextActionDate: nextAction === 'followup_on_date' ? new Date(nextActionDate).toISOString() : null,
          currentQueue: queueType,
          leadStage:  leadStage  || null,
          leadStatus: leadStatus || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log call');

      // Warn if Zoho writeback failed but don't block success
      if (data.zoho && (!data.zoho.fieldsWritten || !data.zoho.noteCreated)) {
        console.warn('[CallLog] Partial Zoho write:', data.zoho);
      }

      onSuccess();
    } catch (error: any) {
      alert(error.message);
      setLoading(false);
    }
  };

  const isMql = queueType === 'mql_outreach';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">

        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 sticky top-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Log Call: {leadName}</h2>
            <p className="text-xs text-gray-500 font-medium">
              Zoho note + stage update written immediately on save.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Caller + Contact Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Caller</label>
              <select value={caller} onChange={e => setCaller(e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                {TEAM_MEMBERS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>

            {queueType !== 'discovery_call' && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Contact Status</label>
                <select value={contactStatus} onChange={e => handleContactStatusChange(e.target.value)}
                  className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="answered">Answered</option>
                  <option value="no_answer">No Answer</option>
                  <option value="call_back_later">Call Back Later</option>
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Call Notes <span className="text-gray-400 font-normal">(synced to Zoho)</span>
            </label>
            <textarea required rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="What did you discuss?"
              className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          {/* Next Action */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-3">
            <label className="text-sm font-bold text-blue-900">Next Action</label>
            <div className="space-y-2">
              {/* Discovery Call — all queues except already in discovery */}
              {queueType !== 'discovery_call' && contactStatus !== 'no_answer' && (
                <label className="flex items-center gap-3 p-2 hover:bg-blue-100 rounded cursor-pointer">
                  <input type="radio" name="action" value="discovery_call" checked={nextAction === 'discovery_call'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-800">Set up Discovery Call
                    <span className="ml-1.5 text-xs text-blue-600 font-normal">(moves to Discovery Queue · Zoho: SQL)</span>
                  </span>
                </label>
              )}

              {/* Ready to fill — discovery queue only */}
              {queueType === 'discovery_call' && (
                <label className="flex items-center gap-3 p-2 hover:bg-blue-100 rounded cursor-pointer">
                  <input type="radio" name="action" value="ready_to_fill" checked={nextAction === 'ready_to_fill'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-800">✅ Ready to Fill Form
                    <span className="ml-1.5 text-xs text-blue-600 font-normal">(resolves lead · Zoho: SQL / Contacted)</span>
                  </span>
                </label>
              )}

              {/* Follow up later */}
              {contactStatus !== 'no_answer' && (
                <label className="flex items-center gap-3 p-2 hover:bg-blue-100 rounded cursor-pointer">
                  <input type="radio" name="action" value="followup_on_date" checked={nextAction === 'followup_on_date'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-800">Follow up later</span>
                </label>
              )}

              {/* Close / disqualify — all queues */}
              {contactStatus !== 'no_answer' && (
                <label className="flex items-center gap-3 p-2 hover:bg-red-50 rounded cursor-pointer">
                  <input type="radio" name="action" value="close_lead" checked={nextAction === 'close_lead'} onChange={e => setNextAction(e.target.value)} className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-gray-700">Remove from SLA
                    <span className="ml-1.5 text-xs text-red-500 font-normal">(closes lead · Zoho: Lead / Not Qualified)</span>
                  </span>
                </label>
              )}

              {/* No answer placeholder */}
              {contactStatus === 'no_answer' && (
                <div className="flex items-center gap-3 p-2 rounded opacity-50">
                  <input type="radio" readOnly checked className="w-4 h-4" />
                  <span className="text-sm font-medium text-gray-800">
                    {isMql ? 'Lead stays in MQL Outreach queue' : 'Lead stays in Call Queue'}
                  </span>
                </div>
              )}
            </div>

            {nextAction === 'followup_on_date' && (
              <div className="pt-1 pl-7">
                <input type="datetime-local" required value={nextActionDate} onChange={e => setNextActionDate(e.target.value)}
                  className="w-full border border-blue-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-xs text-blue-600 mt-1">Lead will reappear in the queue on this date.</p>
              </div>
            )}
          </div>

          {/* Zoho CRM Stage + Status (standard across all queues) */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">Zoho CRM Update</label>
              {(!leadStage && !leadStatus) && (
                <span className="text-xs text-gray-400 italic">No change</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Stage</label>
                <select value={leadStage} onChange={e => setLeadStage(e.target.value)}
                  className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— no change —</option>
                  {LEAD_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Status</label>
                <select value={leadStatus} onChange={e => setLeadStatus(e.target.value)}
                  className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— no change —</option>
                  {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">Pre-populated from your selected action. Edit before saving if needed.</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-2.5 border font-semibold text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
              {loading ? 'Saving to Zoho…' : 'Log & Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
