// Shared presentational helpers for the SLA Monitor, Pending Outreach, and Backlog pages.
// Plain (server-safe) render helpers — they compose the client components NoteTooltip,
// CallLogWrapper, etc. where needed.
import NoteTooltip from '@/components/NoteTooltip';
import Link from 'next/link';

export const TH = 'px-4 py-3';
export const PAGE_SIZE = 30;

// Date-wise pager. Server-rendered links that preserve every other box's page param.
export function Pager({ basePath, params, pageParam, page, total, pageSize = PAGE_SIZE }: {
  basePath: string;
  params: Record<string, string | undefined>;
  pageParam: string;
  page: number;
  total: number;
  pageSize?: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const mk = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && k !== pageParam) sp.set(k, String(v));
    sp.set(pageParam, String(p));
    return `${basePath}?${sp.toString()}#${pageParam}`;
  };
  const btn = 'px-3 py-1 rounded-md text-xs font-semibold border transition-colors';
  const on  = 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50';
  const off = 'text-gray-300 bg-gray-50 border-gray-200 pointer-events-none';
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50/50 text-xs text-gray-500">
      <Link href={mk(page - 1)} className={`${btn} ${page <= 1 ? off : on}`}>← Prev</Link>
      <span>Page {Math.min(page, totalPages)} of {totalPages} · {total} total</span>
      <Link href={mk(page + 1)} className={`${btn} ${page >= totalPages ? off : on}`}>Next →</Link>
    </div>
  );
}

// Columns shared by the box tables. Per-lead "Assigned To" was removed — boxes are
// owned by a person now (see BoxOwner), so the column is gone.
export const UNIFIED_HEADERS = ['Lead', 'Lead Status', 'Hotness', 'Context', 'Action'];

export const HOTNESS_STYLES: Record<string, string> = {
  hot:  'bg-red-100 text-red-800',
  warm: 'bg-orange-100 text-orange-800',
  cold: 'bg-blue-100 text-blue-800',
};

export const CLASS_LABELS: Record<string, string> = {
  interested:   'Interested',
  fee_question: 'Fee Question',
  not_now:      'Not Now',
  wrong_number: 'Wrong Number',
  other:        'Other',
};

// Date only (e.g. "04 Jun, 02:30 pm")
export function formatIST(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeRemaining(due: string): { label: string; breached: boolean } {
  const diff = new Date(due).getTime() - Date.now();
  const breached = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hrs  = Math.floor(mins / 60);
  const rem  = mins % 60;
  const label = hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`;
  return { label: breached ? `Breached by ${label}` : `${label} left`, breached };
}

// Consecutive no-answers since the last answered / call_back_later (logs DESC by called_at)
export function computeNoAnswerCount(logs: { contact_status: string }[]): number {
  let count = 0;
  for (const log of logs) {
    // A connection, a scheduled callback, or a successful message touch ends the streak.
    if (log.contact_status === 'answered' || log.contact_status === 'call_back_later' || log.contact_status === 'message_sent') break;
    if (log.contact_status === 'no_answer') count++;
  }
  return count;
}

export type LogMaps = {
  noAnswerCountMap: Record<string, number>;
  lastNoteMap: Record<string, { caller: string; notes: string }>;
  calledSet: Set<string>;
};

// Build the per-lead call-log derived maps from a flat call_logs array (DESC by called_at).
export function buildLogMaps(
  callLogData: { lead_id: string; contact_status: string; caller: string; notes: string }[] | null,
): LogMaps {
  const noAnswerCountMap: Record<string, number> = {};
  const lastNoteMap: Record<string, { caller: string; notes: string }> = {};
  const calledSet = new Set<string>();
  const byLead: Record<string, { contact_status: string; caller: string; notes: string }[]> = {};
  for (const log of callLogData ?? []) {
    (byLead[log.lead_id] ||= []).push(log);
  }
  for (const [leadId, logs] of Object.entries(byLead)) {
    noAnswerCountMap[leadId] = computeNoAnswerCount(logs);
    calledSet.add(leadId);
    const withNote = logs.find(l => l.notes?.trim());
    if (withNote) lastNoteMap[leadId] = { caller: withNote.caller, notes: withNote.notes };
  }
  return { noAnswerCountMap, lastNoteMap, calledSet };
}

export function MaybeNote({ note }: { note?: { caller: string; notes: string } | null }) {
  if (!note?.notes?.trim()) return null;
  return <NoteTooltip caller={note.caller} notes={note.notes} />;
}

// Box header with the owning person shown as a chip (boxes are assigned to people now).
export function BoxOwner({ name, color = 'gray' }: { name: string; color?: 'amber' | 'blue' | 'purple' | 'gray' }) {
  const styles: Record<string, string> = {
    amber:  'bg-amber-100 text-amber-800 border-amber-200',
    blue:   'bg-blue-100 text-blue-800 border-blue-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
    gray:   'bg-gray-100 text-gray-700 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[color]}`}>
      <span className="opacity-60">Owner</span> {name}
    </span>
  );
}

// Lead cell: name + phone + attempt badge + reply class + Called tag + inline callback date/time.
export function LeadCell({ lead, noAnswerCount = 0, called = false, source }: {
  lead: any; noAnswerCount?: number; called?: boolean; source?: string | null;
}) {
  return (
    <td className="px-4 py-3">
      <div className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
        {lead.name || '—'}
        {called && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 whitespace-nowrap">Called</span>
        )}
        {noAnswerCount > 0 && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
            noAnswerCount >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {noAnswerCount >= 3 ? `⚠️ ${noAnswerCount}×` : `×${noAnswerCount}`}
          </span>
        )}
        {lead.wa_reply_class && CLASS_LABELS[lead.wa_reply_class] && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 whitespace-nowrap">
            {CLASS_LABELS[lead.wa_reply_class]}
          </span>
        )}
        {source && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 whitespace-nowrap">
            {source}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
      {lead.followup_call_at && (
        <div className="text-[11px] text-blue-600 font-medium mt-0.5 whitespace-nowrap">
          📞 Callback: {formatIST(lead.followup_call_at)}
        </div>
      )}
    </td>
  );
}

export function LeadStatusCell({ status }: { status: string | null }) {
  return (
    <td className="px-4 py-3">
      {status
        ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{status}</span>
        : <span className="text-gray-300 text-xs">—</span>}
    </td>
  );
}

export function HotnessCell({ hotness }: { hotness: string | null }) {
  return (
    <td className="px-4 py-3">
      {hotness
        ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${HOTNESS_STYLES[hotness] || 'bg-gray-100 text-gray-600'}`}>{hotness}</span>
        : <span className="text-gray-300 text-xs">—</span>}
    </td>
  );
}
