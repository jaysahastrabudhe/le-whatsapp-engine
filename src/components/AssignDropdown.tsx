'use client';

import { useState } from 'react';

const TEAM_MEMBERS = ['Jonathan', 'Jay', 'Sharjeel', 'Gargi', 'Ankita'];

export default function AssignDropdown({
  leadId,
  currentAssignee,
  defaultAssignee,
}: {
  leadId: string;
  currentAssignee: string | null;
  defaultAssignee?: string;
}) {
  const [value, setValue] = useState(currentAssignee ?? defaultAssignee ?? '');
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    setValue(next);
    setSaving(true);
    try {
      await fetch('/api/admin/assign-lead', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, assignTo: next || null }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={e => handleChange(e.target.value)}
      disabled={saving}
      className={`text-xs border rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-400 transition-opacity
        ${saving ? 'opacity-40 cursor-wait' : 'cursor-pointer'}
        ${!value ? 'text-gray-400 italic' : 'text-gray-800 font-medium'}`}
    >
      <option value="">Unassigned</option>
      {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}
