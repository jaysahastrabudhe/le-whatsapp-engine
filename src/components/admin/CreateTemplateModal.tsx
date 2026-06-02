'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'UTILITY',        label: 'Utility',        desc: 'Account updates, alerts, transactional' },
  { value: 'MARKETING',      label: 'Marketing',      desc: 'Promotions, offers, awareness' },
  { value: 'AUTHENTICATION', label: 'Authentication', desc: 'OTP / verification codes' },
];

const MAX_BUTTONS = 3;

export default function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const [name, setName]         = useState('');
  const [body, setBody]         = useState('');
  const [category, setCategory] = useState('UTILITY');
  const [buttons, setButtons]   = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<{ sid: string; approvalStatus: string } | null>(null);
  const [error, setError]       = useState<string | null>(null);

  // Live variable preview
  const previewBody = body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[var ${n}]`);

  // Count unique variables
  const varCount = new Set((body.match(/\{\{(\d+)\}\}/g) ?? []).map(m => m.replace(/[{}]/g, ''))).size;

  const addButton = useCallback(() => {
    if (buttons.length < MAX_BUTTONS) setButtons(b => [...b, '']);
  }, [buttons.length]);

  const updateButton = useCallback((i: number, val: string) => {
    setButtons(b => b.map((btn, idx) => idx === i ? val : btn));
  }, []);

  const removeButton = useCallback((i: number) => {
    setButtons(b => b.filter((_, idx) => idx !== i));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const filledButtons = buttons.map(b => b.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/admin/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), body: body.trim(), category, buttons: filledButtons }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      setResult({ sid: data.sid, approvalStatus: data.approvalStatus });
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create WhatsApp Template</h2>
            <p className="text-xs text-gray-500 mt-0.5">Creates in Twilio and submits for Meta approval</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Success state */}
        {result ? (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="text-green-600 mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-semibold text-green-800">Template created & submitted for approval</p>
                <p className="text-sm text-green-700 mt-1">
                  Status: <span className="font-medium capitalize">{result.approvalStatus}</span>
                </p>
                <p className="text-xs text-green-600 font-mono mt-1">SID: {result.sid}</p>
                <p className="text-xs text-green-600 mt-2">Meta approval typically takes 24–48 hours.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Template name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Template Name <span className="text-gray-400 font-normal text-xs">(used in system — no spaces)</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value.replace(/\s/g, '_'))}
                placeholder="wa_welcome_new_student"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      category === c.value
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Message body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Message Body
                </label>
                {varCount > 0 && (
                  <span className="text-xs text-blue-600 font-medium">
                    {varCount} variable{varCount > 1 ? 's' : ''} detected
                  </span>
                )}
              </div>
              <textarea
                required
                rows={5}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={"Hi {{1}}, this is a message from Let's Enterprise.\n\nUse {{1}}, {{2}} etc. for personalised variables."}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
              />
              {body && (
                <div className="mt-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                  <span className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Preview · </span>
                  {previewBody}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1.5">
                Use <code className="bg-gray-100 px-1 rounded">{'{{1}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{2}}'}</code> for variables. WhatsApp requires sequential numbering.
              </p>
            </div>

            {/* Quick-reply buttons (optional) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Quick Reply Buttons <span className="text-gray-400 font-normal text-xs">(optional, max {MAX_BUTTONS})</span>
                </label>
                {buttons.length < MAX_BUTTONS && (
                  <button
                    type="button"
                    onClick={addButton}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Plus size={12} /> Add Button
                  </button>
                )}
              </div>
              {buttons.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No buttons — plain text template</p>
              ) : (
                <div className="space-y-2">
                  {buttons.map((btn, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={btn}
                        onChange={e => updateButton(i, e.target.value)}
                        placeholder={`Button ${i + 1} label`}
                        maxLength={25}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeButton(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name || !body}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {loading ? 'Creating…' : 'Create & Submit for Approval'}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
