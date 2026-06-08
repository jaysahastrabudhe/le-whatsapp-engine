'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { positiveCallTarget, NO_ANSWER_LIMIT } from '@/lib/funnel';

const TEAM_MEMBERS = ['Jonathan', 'Jay', 'Sharjeel', 'Gargi', 'Ankita'];

type QueueType = 'call_queue' | 'discovery_call' | 'whatsapp_reply' | 'mql_outreach';
type Outcome = 'positive' | 'negative' | 'no_answer' | 'call_back_later';

// Outcome → call_logs columns (next_action is NOT NULL, so map to an allowed value).
const NEXT_ACTION: Record<Outcome, string> = {
  positive: 'discovery_call',
  negative: 'close_lead',
  no_answer: 'no_answer',
  call_back_later: 'followup_on_date',
};

export default function CallLogModal({
  leadId, zohoLeadId, leadName, queueType, currentStage = null, noAnswerCount = 0,
  channel = 'call', defaultCaller, onClose, onSuccess,
}: {
  leadId: string;
  zohoLeadId: string | null;
  leadName: string;
  queueType: QueueType;
  currentStage?: string | null;
  noAnswerCount?: number;
  channel?: 'call' | 'message';
  defaultCaller?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isMessage = channel === 'message';

  const [loading, setLoading] = useState(false);
  const [caller, setCaller] = useState(defaultCaller && TEAM_MEMBERS.includes(defaultCaller) ? defaultCaller : TEAM_MEMBERS[0]);
  const [outcome, setOutcome] = useState<Outcome>('positive');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');

  const attemptsAfter = noAnswerCount + 1;
  const willGoCold = outcome === 'no_answer' && attemptsAfter >= NO_ANSWER_LIMIT;

  // What a positive outcome will do, given stage + channel.
  const positiveEffect = isMessage
    ? 'Records the reply and unlocks calling — lead stays in the box.'
    : currentStage === 'MQL+++'
      ? '→ SQL (discovery booked / won).'
      : `→ MQL+++ (Gargi decides). Current: ${currentStage || 'MQL'}.`;

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (outcome === 'call_back_later' && !callbackAt) {
      alert('Pick a call-back date & time.');
      return;
    }
    if (!notes.trim()) { alert('Notes are required.'); return; }

    const contactStatus =
      outcome === 'positive' ? (isMessage ? 'message_sent' : 'answered')
      : outcome === 'negative' ? 'negative'
      : outcome === 'no_answer' ? (isMessage ? 'message_no_reply' : 'no_answer')
      : 'call_back_later';

    setLoading(true);
    try {
      const res = await fetch('/api/admin/call-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId, zohoLeadId, caller,
          calledAt: new Date().toISOString(),
          contactStatus,
          notes: notes.trim(),
          nextAction: NEXT_ACTION[outcome],
          nextActionDate: outcome === 'call_back_later' ? new Date(callbackAt).toISOString() : null,
          currentQueue: queueType,
          channel,
          outcome,
          currentStage,
          noAnswerCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log');
      onSuccess();
    } catch (error: any) {
      alert(error.message);
      setLoading(false);
    }
  };

  const OUTCOMES: { value: Outcome; label: string; hint: string; tone: string }[] = isMessage
    ? [
        { value: 'positive', label: '✓ Positive reply', hint: positiveEffect, tone: 'emerald' },
        { value: 'negative', label: '✗ Negative', hint: '→ Junk (disqualified).', tone: 'red' },
        { value: 'no_answer', label: 'No reply', hint: 'Record-only — stays in box.', tone: 'gray' },
      ]
    : [
        { value: 'positive', label: '✓ Positive', hint: positiveEffect, tone: 'emerald' },
        { value: 'negative', label: '✗ Negative', hint: '→ Junk (disqualified).', tone: 'red' },
        { value: 'no_answer', label: 'No answer', hint: willGoCold ? `${attemptsAfter}th attempt → Cold` : 'Stays in queue (retry).', tone: 'gray' },
        { value: 'call_back_later', label: 'Call back later', hint: 'Schedule a callback date/time.', tone: 'blue' },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">

        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 sticky top-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{isMessage ? 'Log Message' : 'Log Call'}: {leadName}</h2>
              {currentStage && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{currentStage}</span>
              )}
              {noAnswerCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${noAnswerCount >= NO_ANSWER_LIMIT ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {noAnswerCount} unanswered
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-medium">Outcome drives the funnel · Zoho note + stage written on save.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Caller</label>
            <select value={caller} onChange={e => setCaller(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              {TEAM_MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>

          {/* Outcome */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-2">
            <label className="text-sm font-bold text-blue-900">Outcome</label>
            <div className="space-y-2">
              {OUTCOMES.map(o => (
                <label key={o.value} className="flex items-start gap-3 p-2 hover:bg-blue-100/60 rounded cursor-pointer">
                  <input type="radio" name="outcome" value={o.value} checked={outcome === o.value}
                    onChange={() => setOutcome(o.value)} className="w-4 h-4 mt-0.5 text-blue-600" />
                  <span className="text-sm">
                    <span className="font-medium text-gray-800">{o.label}</span>
                    <span className="ml-1.5 text-xs text-gray-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {outcome === 'call_back_later' && (
              <div className="pt-1 pl-7">
                <input type="datetime-local" required value={callbackAt} onChange={e => setCallbackAt(e.target.value)}
                  className="w-full border border-blue-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-xs text-blue-600 mt-1">Lead reappears on this date.</p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              {isMessage ? 'Message Notes' : 'Call Notes'} <span className="text-gray-400 font-normal">(synced to Zoho)</span>
            </label>
            <textarea required rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={isMessage ? 'What did you message? Their reply, if any?' : 'What did you discuss?'}
              className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-2.5 border font-semibold text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
              {loading ? 'Saving…' : (isMessage ? 'Log Message' : 'Log Call')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
