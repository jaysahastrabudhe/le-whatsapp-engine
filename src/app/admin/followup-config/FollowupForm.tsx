'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Config = {
  rule5_enabled: boolean;
  rule5_delay_hours: number;
  rule5_template: string;
  rule6_enabled: boolean;
  rule6_delay_hours: number;
  rule6a_template: string;
  rule6b_template: string;
};

type Template = { name: string; sid: string };

export function FollowupForm({ initial, templates }: { initial: Config; templates: Template[] }) {
  const [cfg, setCfg] = useState<Config>(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const router = useRouter();

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setState('saving');
    try {
      const res = await fetch('/api/admin/followup-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        setState('saved');
        router.refresh();
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  const templateOptions = templates.map((t) => (
    <option key={t.sid} value={t.name}>{t.name}</option>
  ));

  return (
    <div className="space-y-6">
      {/* Rule 5 */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">First Follow-up</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Sent when a lead hasn&apos;t replied after the initial welcome message.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-500">{cfg.rule5_enabled ? 'Enabled' : 'Disabled'}</span>
            <div
              onClick={() => set('rule5_enabled', !cfg.rule5_enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${cfg.rule5_enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.rule5_enabled ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>
        <div className={`px-6 py-5 space-y-4 ${!cfg.rule5_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Delay after welcome message</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={cfg.rule5_delay_hours}
                  onChange={(e) => set('rule5_delay_hours', parseInt(e.target.value) || 24)}
                  className="w-20 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="text-sm text-gray-500">hours with no reply</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Template to send</label>
              <select
                value={cfg.rule5_template}
                onChange={(e) => set('rule5_template', e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                {templateOptions}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Trigger: <code className="bg-gray-100 px-1 rounded">wa_state = first_sent</code> + no inbound reply
          </p>
        </div>
      </div>

      {/* Rule 6 */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Re-engagement</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Sent when a lead replied once but has gone quiet.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-500">{cfg.rule6_enabled ? 'Enabled' : 'Disabled'}</span>
            <div
              onClick={() => set('rule6_enabled', !cfg.rule6_enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${cfg.rule6_enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.rule6_enabled ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>
        <div className={`px-6 py-5 space-y-5 ${!cfg.rule6_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Delay after last inbound reply</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={168}
                value={cfg.rule6_delay_hours}
                onChange={(e) => set('rule6_delay_hours', parseInt(e.target.value) || 48)}
                className="w-20 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="text-sm text-gray-500">hours of silence</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Rule 6a — No track selected</label>
              <select
                value={cfg.rule6a_template}
                onChange={(e) => set('rule6a_template', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                {templateOptions}
              </select>
              <p className="text-xs text-gray-400">Lead replied but hasn&apos;t chosen a track yet</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Rule 6b — Track already set</label>
              <select
                value={cfg.rule6b_template}
                onChange={(e) => set('rule6b_template', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                {templateOptions}
              </select>
              <p className="text-xs text-gray-400">Lead replied and has a track set</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Trigger: <code className="bg-gray-100 px-1 rounded">wa_state = replied</code> + silence window exceeded
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={state === 'saving'}
          className="px-5 py-2 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {state === 'saving' ? 'Saving…' : 'Save Changes'}
        </button>
        {state === 'saved' && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
        {state === 'error' && (
          <span className="text-sm text-red-600">
            Failed to save — make sure the <code className="bg-red-50 px-1 rounded">followup_config</code> migration has been applied in Supabase.
          </span>
        )}
      </div>
    </div>
  );
}
