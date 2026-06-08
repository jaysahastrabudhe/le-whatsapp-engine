'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MOVABLE_STAGES } from '@/lib/funnel';

export default function MoveStageSelect({ leadId, zohoLeadId, currentStage }: {
  leadId: string;
  zohoLeadId: string | null;
  currentStage: string | null;
}) {
  const [stage, setStage] = useState(currentStage && MOVABLE_STAGES.includes(currentStage) ? currentStage : '');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function move(next: string) {
    if (!next || next === currentStage) { setStage(next); return; }
    setSaving(true);
    const prev = stage;
    setStage(next);
    try {
      const res = await fetch('/api/admin/move-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, zohoLeadId, stage: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Move failed');
      if (d.warning) alert(d.warning); // saved locally but Zoho rejected (e.g. picklist missing)
      router.refresh();
    } catch (e: any) {
      setStage(prev);
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={stage}
      disabled={saving}
      onChange={(e) => move(e.target.value)}
      title="Move to stage"
      className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
    >
      <option value="">— stage —</option>
      {MOVABLE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
