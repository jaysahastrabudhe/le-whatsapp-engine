import { supabase } from '@/lib/supabase';
import ManualReplyForm from '@/components/ManualReplyForm';
import CallLogWrapper from '@/components/CallLogWrapper';
import TriggerCronButton from '@/components/TriggerCronButton';
import AssignDropdown from '@/components/AssignDropdown';
import NoteTooltip from '@/components/NoteTooltip';
import { ChevronRight } from 'lucide-react';

export const revalidate = 0;

function formatIST(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeRemaining(due: string): { label: string; breached: boolean } {
  const diff = new Date(due).getTime() - Date.now();
  const breached = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const hrs  = Math.floor(mins / 60);
  const rem  = mins % 60;
  const label = hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`;
  return { label: breached ? `Breached by ${label}` : `${label} left`, breached };
}

const HOTNESS_STYLES: Record<string, string> = {
  hot:  'bg-red-100 text-red-800',
  warm: 'bg-orange-100 text-orange-800',
  cold: 'bg-blue-100 text-blue-800',
};

const CLASS_LABELS: Record<string, string> = {
  interested:   'Interested',
  fee_question: 'Fee Question',
  not_now:      'Not Now',
  wrong_number: 'Wrong Number',
  other:        'Other',
};

// Compute no-answer attempt count from ordered call logs (DESC by called_at)
function computeNoAnswerCount(logs: { contact_status: string }[]): number {
  let count = 0;
  for (const log of logs) {
    if (log.contact_status === 'answered' || log.contact_status === 'call_back_later') break;
    if (log.contact_status === 'no_answer') count++;
  }
  return count;
}

// Inline helper so server component can conditionally render the client NoteTooltip
function MaybeNote({ note }: { note?: { caller: string; notes: string } | null }) {
  if (!note?.notes?.trim()) return null;
  return <NoteTooltip caller={note.caller} notes={note.notes} />;
}

// Unified lead cell: name + phone + attempt badge + reply class pill + called tag
function LeadCell({ lead, noAnswerCount = 0, called = false }: { lead: any; noAnswerCount?: number; called?: boolean }) {
  return (
    <td className="px-4 py-3">
      <div className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
        {lead.name || '—'}
        {called && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 whitespace-nowrap">
            Called
          </span>
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
      </div>
      <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
    </td>
  );
}

function LeadStatusCell({ status }: { status: string | null }) {
  return (
    <td className="px-4 py-3">
      {status
        ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{status}</span>
        : <span className="text-gray-300 text-xs">—</span>}
    </td>
  );
}

function HotnessCell({ hotness }: { hotness: string | null }) {
  return (
    <td className="px-4 py-3">
      {hotness
        ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${HOTNESS_STYLES[hotness] || 'bg-gray-100 text-gray-600'}`}>{hotness}</span>
        : <span className="text-gray-300 text-xs">—</span>}
    </td>
  );
}

const TH = 'px-4 py-3';
const UNIFIED_HEADERS = ['Lead', 'Lead Status', 'Hotness', 'Assigned To', 'Context', 'Action'];

export default async function SLAMonitorPage() {
  const now = new Date().getTime();

  // 0. MQL Outreach
  // Include rows where lead_status IS NULL — PostgreSQL's NOT IN evaluates NULL as
  // unknown and silently drops those rows, which would hide most untriaged MQL leads.
  const MQL_EXCLUDE_STATUSES = ['Contacted', 'Junk Lead', 'Lost Lead', 'Not Qualified', 'Attempted to Contact'];
  const excludeList = `(${MQL_EXCLUDE_STATUSES.map(s => `"${s}"`).join(',')})`;
  const { data: mqlLeads } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, lead_stage, lead_status, wa_hotness, wa_reply_class, call_assigned_to, updated_at')
    .eq('lead_stage', 'MQL')
    .or(`lead_status.is.null,lead_status.not.in.${excludeList}`)
    .order('updated_at', { ascending: false });

  const mqlOutreachLeads = mqlLeads || [];

  // 1. Call Tracking (call_queued, call_follow_up, discovery_call)
  const { data: callTracking } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, call_assigned_to, lead_status, wa_reply_class, updated_at, created_at, wa_state, followup_call_at, wa_hotness')
    .in('wa_state', ['call_queued', 'call_follow_up', 'discovery_call'])
    .order('created_at', { ascending: false });

  const allCallLeads = callTracking || [];

  const callQueueLeads = allCallLeads.filter(l => {
    if (l.wa_state === 'call_queued') return true;
    if (l.wa_state === 'call_follow_up' && l.followup_call_at && new Date(l.followup_call_at).getTime() <= now) return true;
    return false;
  });

  const discoveryQueueLeads = allCallLeads.filter(l => {
    if (l.wa_state === 'discovery_call') {
      if (!l.followup_call_at) return true;
      if (new Date(l.followup_call_at).getTime() <= now) return true;
    }
    return false;
  });

  const scheduledLeads = allCallLeads.filter(l =>
    l.followup_call_at && new Date(l.followup_call_at).getTime() > now
  ).sort((a, b) => new Date(a.followup_call_at!).getTime() - new Date(b.followup_call_at!).getTime());

  // Backlog A: WA replied leads that were never actioned (no call made after reply)
  // Only include leads that replied after Apr 21 — the system launch date
  const SYSTEM_LAUNCH = '2026-04-21T00:00:00+05:30';
  const { data: backlogReplied } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_last_inbound_at, wa_reply_class, wa_hotness, call_assigned_to, lead_status, wa_state')
    .eq('wa_state', 'replied')
    .not('wa_last_inbound_at', 'is', null)
    .gte('wa_last_inbound_at', SYSTEM_LAUNCH)
    .order('wa_last_inbound_at', { ascending: true });

  // Backlog B: Scheduled follow-ups that are 3+ days overdue with no call logged after due date
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: backlogOverdue } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, followup_call_at, wa_reply_class, wa_hotness, call_assigned_to, lead_status, wa_state')
    .in('wa_state', ['call_follow_up', 'discovery_call'])
    .not('followup_call_at', 'is', null)
    .lt('followup_call_at', threeDaysAgo)
    .order('followup_call_at', { ascending: true });

  const backlogRepliedLeads = backlogReplied || [];
  const backlogOverdueLeads = backlogOverdue || [];

  // Nurture / Not Now: leads who replied "not now" (wa_state = 'wa_nurture').
  // These are a soft-no — not dismissed — but had no home section before, so they
  // silently vanished. Surface them here so ops can re-engage later.
  const { data: nurture } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_last_inbound_at, wa_reply_class, wa_hotness, call_assigned_to, lead_status, wa_state')
    .eq('wa_state', 'wa_nurture')
    .order('wa_last_inbound_at', { ascending: false });
  const nurtureLeads = nurture || [];

  // 2. WhatsApp SLAs (Active)
  const { data: active } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, owner_email, wa_hotness, wa_reply_class, lead_status, call_assigned_to, wa_human_response_due_at')
    .not('wa_human_response_due_at', 'is', null)
    .not('wa_state', 'in', '("wa_closed","wa_idle","wa_sla_escalated","wa_sla_resolved")')
    .order('wa_human_response_due_at', { ascending: true });

  // 3. Escalated
  const { data: escalated } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, owner_email, wa_hotness, wa_reply_class, lead_status, call_assigned_to, updated_at')
    .eq('wa_state', 'wa_sla_escalated')
    .order('updated_at', { ascending: false })
    .limit(20);

  const activeLeads = active || [];
  const escalatedLeads = escalated || [];

  // 4. Fetch all call logs in one shot — used for noAnswerCount, calledSet, and last note
  // Fetching all logs (not filtered by current page leads) ensures the Called tag
  // is accurate for any lead, regardless of what section they appear in.
  const { data: callLogData } = await supabase
    .from('call_logs')
    .select('lead_id, contact_status, caller, notes')
    .order('called_at', { ascending: false });

  const noAnswerCountMap: Record<string, number> = {};
  const lastNoteMap: Record<string, { caller: string; notes: string }> = {};
  const calledSet = new Set<string>();

  const byLead: Record<string, { contact_status: string; caller: string; notes: string }[]> = {};
  for (const log of callLogData ?? []) {
    if (!byLead[log.lead_id]) byLead[log.lead_id] = [];
    byLead[log.lead_id].push(log);
  }
  for (const [leadId, logs] of Object.entries(byLead)) {
    noAnswerCountMap[leadId] = computeNoAnswerCount(logs);
    calledSet.add(leadId);
    const withNote = logs.find(l => l.notes?.trim());
    if (withNote) lastNoteMap[leadId] = { caller: withNote.caller, notes: withNote.notes };
  }

  // 5. Pipeline stats
  const CALL_LOG_LAUNCH = new Date('2026-04-21T00:00:00+05:30').toISOString();
  const { count: waRepliedCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('wa_state', 'replied')
    .gte('wa_last_inbound_at', CALL_LOG_LAUNCH);

  // Manual Entry count: leads that entered via csv_import and are still active
  const { data: csvImportEvents } = await supabase
    .from('lead_events')
    .select('lead_id')
    .eq('event_type', 'csv_import');
  const csvLeadIds = [...new Set((csvImportEvents || []).map((e: any) => e.lead_id))];
  let manualEntryCount = 0;
  if (csvLeadIds.length > 0) {
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('id', csvLeadIds as string[])
      .not('wa_state', 'in', '("wa_closed","opted_out")');
    manualEntryCount = count ?? 0;
  }

  const today6am = new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T06:00:00+05:30'
  ).toISOString();
  const { data: todayCallLogs } = await supabase
    .from('call_logs')
    .select('contact_status')
    .gte('called_at', today6am);
  const callsAnswered = (todayCallLogs || []).filter(c => c.contact_status === 'answered').length;
  const callsNoAnswer = (todayCallLogs || []).filter(c => c.contact_status === 'no_answer').length;
  const callsCallBack = (todayCallLogs || []).filter(c => c.contact_status === 'call_back_later').length;

  // 6. Combined Pending Outreach (call queue + WA replies)
  const callQueueLeadsMapped = callQueueLeads.map(lead => ({
    ...lead,
    listType: 'manual_call',
    // Overdue follow-ups use their followup_call_at (past timestamp → sort first, most overdue first).
    // Pure call_queued leads: invert created_at so newest lead = smallest value = appears first,
    // and all values stay > any overdue date (anchor 2030 >> any current timestamp).
    sortTime: lead.followup_call_at
      ? new Date(lead.followup_call_at).getTime()
      : new Date('2030-01-01').getTime() * 2 - new Date(lead.created_at).getTime(),
  }));
  const activeLeadsMapped = activeLeads.map(lead => ({
    ...lead,
    listType: 'whatsapp_reply',
    sortTime: new Date(lead.wa_human_response_due_at!).getTime(),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const combinedLeads: any[] = [...callQueueLeadsMapped, ...activeLeadsMapped].sort((a, b) => a.sortTime - b.sortTime);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">SLA Monitor & Call Queues</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage human responses for WhatsApp replies and handle the manual Call Tracking pipeline.
        </p>
      </div>

      {/* ── Lead Pipeline ───────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b bg-gray-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lead Pipeline</span>
          <span className="text-xs text-gray-400">Live counts · refreshes on page load</span>
        </div>
        <div className="px-5 py-4 overflow-x-auto">
          <div className="flex justify-center">
            <div className="flex items-center gap-3 min-w-max">

              {/* Entry sources */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Entry</p>
                <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 min-w-[190px]">
                  <span className="text-sm">💬</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-800">WA Replied</p>
                    <p className="text-[10px] text-blue-500">inbound replies since Apr 21</p>
                  </div>
                  <span className="text-sm font-bold text-blue-700">{waRepliedCount ?? 0}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 min-w-[190px]">
                  <span className="text-sm">🟡</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-800">MQL from Zoho</p>
                    <p className="text-[10px] text-amber-500">synced daily</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700">{mqlOutreachLeads.length}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5 min-w-[190px]">
                  <span className="text-sm">✋</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-600">Manual Entry</p>
                    <p className="text-[10px] text-gray-400">undelivered → manually messaged → replied</p>
                  </div>
                  <span className="text-sm font-bold text-gray-600">{manualEntryCount}</span>
                </div>
              </div>

              <ChevronRight size={18} className="text-gray-300 flex-shrink-0 self-center" />

              {/* Call Queue */}
              <div className={`flex flex-col justify-center rounded-xl border-2 px-5 py-4 min-w-[140px] text-center self-stretch
                ${escalatedLeads.length > 0 ? 'border-amber-300 bg-amber-50' : 'border-amber-200 bg-amber-50/50'}`}>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">Call Queue</p>
                <p className="text-3xl font-bold text-amber-700">{callQueueLeads.length}</p>
                {escalatedLeads.length > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-[10px] font-semibold mx-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {escalatedLeads.length} escalated
                  </div>
                )}
              </div>

              <ChevronRight size={18} className="text-gray-300 flex-shrink-0 self-center" />

              {/* Discovery */}
              <div className="flex flex-col justify-center rounded-xl border-2 border-blue-200 bg-blue-50/50 px-5 py-4 min-w-[130px] text-center self-stretch">
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1">Discovery</p>
                <p className="text-3xl font-bold text-blue-700">{discoveryQueueLeads.length}</p>
                <p className="text-[10px] text-blue-400 mt-1">Gargi</p>
              </div>

              <ChevronRight size={18} className="text-gray-300 flex-shrink-0 self-center" />

              {/* Today's Calls */}
              <div className="flex flex-col justify-center rounded-xl border-2 border-green-200 bg-green-50/50 px-5 py-4 min-w-[180px] self-stretch">
                <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-3">Today</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-xs text-gray-600">Calls Went Through</span>
                    <span className="text-sm font-bold text-green-600">{callsAnswered}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-xs text-gray-600">Not Gone Through</span>
                    <span className="text-sm font-bold text-gray-500">{callsNoAnswer}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-xs text-gray-600">Call Back Later</span>
                    <span className="text-sm font-bold text-amber-600">{callsCallBack}</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-3">since 6:00 AM</p>
              </div>

            </div>
          </div>
        </div>
      </div>

      <ManualReplyForm />

      <hr className="border-gray-200" />

      {/* 1. ESCALATED */}
      {escalatedLeads.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Escalated — Zoho Task Created <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{escalatedLeads.length}</span>
            </h2>
          </div>
          <div className="bg-red-50/10 border border-red-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-red-50/50 border-b text-xs text-gray-500 uppercase tracking-wider">
                  {UNIFIED_HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {escalatedLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-red-100/50 hover:bg-red-50/40 bg-white">
                    <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                    <LeadStatusCell status={lead.lead_status} />
                    <HotnessCell hotness={lead.wa_hotness} />
                    <td className={TH}>
                      <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} defaultAssignee="Jonathan" />
                    </td>
                    <td className={TH + ' text-xs text-red-600 font-medium whitespace-nowrap'}>
                      Escalated {formatIST(lead.updated_at)}
                      <MaybeNote note={lastNoteMap[lead.id]} />
                    </td>
                    <td className={TH + ' text-right'}>
                      <CallLogWrapper lead={lead} queueType="whatsapp_reply" noAnswerCount={noAnswerCountMap[lead.id] ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. MQL OUTREACH */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            MQL Outreach{' '}
            <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{mqlOutreachLeads.length}</span>
          </h2>
          <span className="text-xs text-gray-400 ml-1">Lead Stage = MQL · not yet contacted or disqualified</span>
          <TriggerCronButton cron="mql-sync" label="Sync from Zoho" />
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-amber-50/40 border-b text-xs text-gray-500 uppercase tracking-wider">
                {UNIFIED_HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {mqlOutreachLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No MQL leads pending outreach.
                  </td>
                </tr>
              ) : mqlOutreachLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-amber-50/20">
                  <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                  <LeadStatusCell status={lead.lead_status} />
                  <HotnessCell hotness={lead.wa_hotness} />
                  <td className={TH}>
                    <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} />
                  </td>
                  <td className={TH + ' text-xs text-gray-500'}>
                    Updated {formatIST(lead.updated_at)}
                    <MaybeNote note={lastNoteMap[lead.id]} />
                  </td>
                  <td className={TH + ' text-right'}>
                    <CallLogWrapper lead={lead} queueType="mql_outreach" noAnswerCount={noAnswerCountMap[lead.id] ?? 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* 3. PENDING OUTREACH (call queue + WA replies) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Pending Outreach <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{combinedLeads.length}</span>
            </h2>
          </div>
          {activeLeadsMapped.filter(l => new Date(l.wa_human_response_due_at!).getTime() < Date.now()).length > 0 && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {activeLeadsMapped.filter(l => new Date(l.wa_human_response_due_at!).getTime() < Date.now()).length} SLA breached
            </span>
          )}
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
                {UNIFIED_HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {combinedLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No pending outreach — all caught up.
                  </td>
                </tr>
              ) : combinedLeads.map((lead) => {
                const isWhatsApp = lead.listType === 'whatsapp_reply';
                let contextLabel = '';
                let isBreached = false;
                if (isWhatsApp) {
                  const r = timeRemaining(lead.wa_human_response_due_at!);
                  contextLabel = r.label;
                  isBreached = r.breached;
                } else {
                  contextLabel = lead.followup_call_at
                    ? `Follow-up due ${formatIST(lead.followup_call_at)}`
                    : `Queued ${formatIST(lead.created_at)}`;
                }

                return (
                  <tr key={lead.id} className={`border-b hover:bg-gray-50/50 ${isBreached ? 'bg-red-50/40' : ''}`}>
                    <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                    <LeadStatusCell status={lead.lead_status} />
                    <HotnessCell hotness={lead.wa_hotness} />
                    <td className={TH}>
                      {isWhatsApp
                        ? (lead.owner_email
                          ? <span className="text-sm text-gray-600">{lead.owner_email}</span>
                          : <span className="text-orange-500 text-xs">Unassigned</span>)
                        : <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} />
                      }
                    </td>
                    <td className={TH}>
                      <div className="flex items-center gap-1.5">
                        {isWhatsApp
                          ? <span className={`text-xs font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-800`}>WA Reply</span>
                          : <span className={`text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800`}>Call Queue</span>
                        }
                        <span className={`text-xs ${isBreached ? 'text-red-600 font-bold' : 'text-gray-500'} whitespace-nowrap`}>
                          {contextLabel}
                        </span>
                      </div>
                      <MaybeNote note={lastNoteMap[lead.id]} />
                    </td>
                    <td className={TH + ' text-right'}>
                      <CallLogWrapper
                        lead={lead}
                        queueType={isWhatsApp ? 'whatsapp_reply' : 'call_queue'}
                        noAnswerCount={noAnswerCountMap[lead.id] ?? 0}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* 4. DISCOVERY QUEUE */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Discovery Call Queue <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{discoveryQueueLeads.length}</span>
          </h2>
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-purple-50/30 border-b text-xs text-gray-500 uppercase tracking-wider">
                {UNIFIED_HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {discoveryQueueLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No discovery calls pending.
                  </td>
                </tr>
              ) : discoveryQueueLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50/50">
                  <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                  <LeadStatusCell status={lead.lead_status} />
                  <HotnessCell hotness={lead.wa_hotness} />
                  <td className={TH}>
                    <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} defaultAssignee="Gargi" />
                  </td>
                  <td className={TH + ' text-xs text-gray-500'}>
                    {lead.followup_call_at
                      ? <span className="text-amber-600">Follow-up due {formatIST(lead.followup_call_at)}</span>
                      : formatIST(lead.updated_at)
                    }
                    <MaybeNote note={lastNoteMap[lead.id]} />
                  </td>
                  <td className={TH + ' text-right'}>
                    <CallLogWrapper lead={lead} queueType="discovery_call" noAnswerCount={noAnswerCountMap[lead.id] ?? 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* 5. SCHEDULED CALLBACKS */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Scheduled Callbacks <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{scheduledLeads.length}</span>
          </h2>
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm opacity-80 hover:opacity-100 transition-opacity">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
                {UNIFIED_HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {scheduledLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No future callbacks scheduled.
                  </td>
                </tr>
              ) : scheduledLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50/50">
                  <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                  <LeadStatusCell status={lead.lead_status} />
                  <HotnessCell hotness={lead.wa_hotness} />
                  <td className={TH}>
                    <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} />
                  </td>
                  <td className={TH}>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        lead.wa_state === 'discovery_call' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {lead.wa_state === 'discovery_call' ? 'Discovery' : 'General Call'}
                      </span>
                      <span className="text-xs text-blue-600 font-medium">
                        {formatIST(lead.followup_call_at)}
                      </span>
                    </div>
                    <MaybeNote note={lastNoteMap[lead.id]} />
                  </td>
                  <td className={TH + ' text-right'}>
                    <CallLogWrapper
                      lead={lead}
                      queueType={lead.wa_state === 'discovery_call' ? 'discovery_call' : 'call_queue'}
                      noAnswerCount={noAnswerCountMap[lead.id] ?? 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* 6. BACKLOG CALLS */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Backlog Calls{' '}
            <span className="ml-1 bg-rose-100 text-rose-700 py-0.5 px-2 rounded-full text-xs">
              {backlogRepliedLeads.length + backlogOverdueLeads.length}
            </span>
          </h2>
        </div>
        <p className="text-xs text-gray-400 mb-4 ml-4">
          Leads who replied on WhatsApp but were never called back, or had a scheduled follow-up that was missed by 3+ days.
        </p>

        {/* Backlog A: WA Replied — No Call Made */}
        {backlogRepliedLeads.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-2">
              💬 WA Replied — No Call Made
              <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-semibold">{backlogRepliedLeads.length}</span>
            </p>
            <div className="bg-white border border-rose-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-rose-50/40 border-b text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2">Lead</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Hotness</th>
                    <th className="px-4 py-2">Assigned</th>
                    <th className="px-4 py-2">Replied</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogRepliedLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-rose-50 hover:bg-rose-50/20">
                      <LeadCell lead={lead} called={calledSet.has(lead.id)} />
                      <LeadStatusCell status={lead.lead_status} />
                      <HotnessCell hotness={lead.wa_hotness} />
                      <td className="px-4 py-3">
                        <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} />
                      </td>
                      <td className="px-4 py-3 text-xs text-rose-600 font-medium whitespace-nowrap">
                        {formatIST(lead.wa_last_inbound_at)}
                        <MaybeNote note={lastNoteMap[lead.id]} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CallLogWrapper lead={lead} queueType="call_queue" noAnswerCount={0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Backlog B: Missed Follow-ups (3+ days overdue) */}
        {backlogOverdueLeads.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-2">
              📞 Missed Follow-ups — 3+ Days Overdue
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold">{backlogOverdueLeads.length}</span>
            </p>
            <div className="bg-white border border-orange-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-orange-50/40 border-b text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2">Lead</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Hotness</th>
                    <th className="px-4 py-2">Assigned</th>
                    <th className="px-4 py-2">Was Due</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogOverdueLeads.map((lead) => {
                    const daysOverdue = Math.floor((Date.now() - new Date(lead.followup_call_at!).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={lead.id} className="border-b border-orange-50 hover:bg-orange-50/20">
                        <LeadCell lead={lead} called={calledSet.has(lead.id)} />
                        <LeadStatusCell status={lead.lead_status} />
                        <HotnessCell hotness={lead.wa_hotness} />
                        <td className="px-4 py-3">
                          <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} />
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className="text-orange-600 font-semibold">{daysOverdue}d overdue</span>
                          <span className="text-gray-400 ml-1">· {formatIST(lead.followup_call_at)}</span>
                          <MaybeNote note={lastNoteMap[lead.id]} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <CallLogWrapper
                            lead={lead}
                            queueType={lead.wa_state === 'discovery_call' ? 'discovery_call' : 'call_queue'}
                            noAnswerCount={0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {backlogRepliedLeads.length === 0 && backlogOverdueLeads.length === 0 && (
          <div className="bg-white border rounded-lg px-4 py-10 text-center text-gray-400 text-sm">
            No backlog — all replies and follow-ups are on track. 🎉
          </div>
        )}
      </section>

      {nurtureLeads.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Nurture — Not Now{' '}
              <span className="ml-1 bg-violet-100 text-violet-700 py-0.5 px-2 rounded-full text-xs">
                {nurtureLeads.length}
              </span>
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-4 ml-4">
            Leads who replied “not now” — a soft no, not dismissed. Re-engage later or queue a call when timing is better.
          </p>
          <div className="bg-white border border-violet-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-violet-50/40 border-b text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2">Lead</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Hotness</th>
                  <th className="px-4 py-2">Assigned</th>
                  <th className="px-4 py-2">Last Reply</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {nurtureLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-violet-50 hover:bg-violet-50/20">
                    <LeadCell lead={lead} called={calledSet.has(lead.id)} />
                    <LeadStatusCell status={lead.lead_status} />
                    <HotnessCell hotness={lead.wa_hotness} />
                    <td className="px-4 py-3">
                      <AssignDropdown leadId={lead.id} currentAssignee={lead.call_assigned_to} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatIST(lead.wa_last_inbound_at)}
                      <MaybeNote note={lastNoteMap[lead.id]} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CallLogWrapper lead={lead} queueType="call_queue" noAnswerCount={0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <hr className="border-gray-200 mt-12 mb-8" />

      {/* WORKFLOW GUIDE */}
      <section className="bg-blue-50 border border-blue-100 rounded-lg p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-1">Daily Operations Workflow</h3>
        <p className="text-xs text-blue-600 mb-5">Follow this sequence each session to keep leads moving and SLAs clear.</p>

        <div className="overflow-x-auto rounded-lg border border-blue-100 shadow-sm">
          <table className="w-full text-sm text-left bg-white">
            <thead>
              <tr className="bg-blue-100/60 border-b border-blue-100 text-xs text-blue-800 uppercase tracking-wider">
                <th className="px-4 py-3 w-8">#</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3 whitespace-nowrap">When</th>
                <th className="px-4 py-3 whitespace-nowrap">Who</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  step: 1,
                  task: <>Check <a href="/admin/analytics?tab=messages" className="underline text-blue-700 hover:text-blue-900">Message Log</a> — review inbound replies, send responses within the 24h window, and Queue Call for leads worth phoning.</>,
                  when: 'Morning',
                  who: 'Jonathan',
                  highlight: false,
                },
                {
                  step: 2,
                  task: <>Export <a href="/api/admin/export-failed" className="underline text-blue-700 hover:text-blue-900">Failed Messages CSV</a> → send manually via WhatsApp Desktop for numbers the engine could not reach.</>,
                  when: 'Morning',
                  who: 'Jonathan',
                  highlight: false,
                },
                {
                  step: 3,
                  task: <>Import replies from manual WhatsApp messages via <a href="/admin/import-replies" className="underline text-blue-700 hover:text-blue-900">Import / Export CSV</a>. This keeps lead status and hotness up to date.</>,
                  when: 'Routinely',
                  who: 'Jonathan',
                  highlight: false,
                },
                {
                  step: 4,
                  task: 'Handle Escalated leads at the top of this page — Zoho tasks have been raised for these. Clear them first.',
                  when: 'Morning',
                  who: 'Jonathan',
                  highlight: true,
                },
                {
                  step: 5,
                  task: 'Work through the Pending Outreach queue — log each call. Selecting "Set up discovery call" promotes the lead and clears the SLA timer. For repeated no-answers (⚠️ badge), consider closing the lead.',
                  when: 'Routinely',
                  who: 'Jonathan',
                  highlight: false,
                },
                {
                  step: 6,
                  task: 'Conduct Discovery Calls from the Discovery Queue. Once sold, log the call and mark as "Ready to Fill Form" to clear from the board.',
                  when: 'Routinely',
                  who: 'Gargi',
                  highlight: false,
                },
                {
                  step: 7,
                  task: 'Review Scheduled Callbacks — check who is due today and confirm or reschedule.',
                  when: 'End of day',
                  who: 'Jonathan',
                  highlight: false,
                },
                {
                  step: 8,
                  task: <>Review <a href="/admin/analytics?tab=performance" className="underline text-blue-700 hover:text-blue-900">Template Performance</a> — check delivery %, reply %, and top errors. Pause or replace under-performing templates. Also review Campaign results.</>,
                  when: 'Weekly',
                  who: '—',
                  highlight: false,
                },
              ].map(({ step, task, when, who, highlight }) => (
                <tr key={step} className={`border-b border-blue-50 ${highlight ? 'bg-red-50/40' : 'hover:bg-blue-50/30'}`}>
                  <td className="px-4 py-3 font-bold text-blue-400 text-base">{step}</td>
                  <td className="px-4 py-3 text-gray-800 leading-relaxed">{task}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      when === 'Morning'    ? 'bg-yellow-100 text-yellow-800' :
                      when === 'End of day' ? 'bg-indigo-100 text-indigo-700' :
                      when === 'Weekly'     ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{when}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-blue-500 mt-4 italic">
          Tip: If a lead needs more time, select &ldquo;Follow up later&rdquo; when logging a call — they vanish from the queue and reappear automatically on the date you choose.
        </p>
      </section>
    </div>
  );
}
