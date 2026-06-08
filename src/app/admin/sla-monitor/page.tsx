import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import ManualReplyForm from '@/components/ManualReplyForm';
import CallLogWrapper from '@/components/CallLogWrapper';
import TriggerCronButton from '@/components/TriggerCronButton';
import {
  TH, PAGE_SIZE, formatIST, buildLogMaps,
  MaybeNote, BoxOwner, Pager, LeadCell, LeadStatusCell, HotnessCell,
} from '@/components/admin/leadCells';
import MoveStageSelect from '@/components/admin/MoveStageSelect';
import { ChevronRight } from 'lucide-react';

export const revalidate = 0;

const BASE = '/admin/sla-monitor';
// Boxes get a Stage column (move control) — distinct from the shared 5-col layout.
const HEADERS = ['Lead', 'Lead Status', 'Hotness', 'Context', 'Stage', 'Action'];

export default async function SLAMonitorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const nowIso = new Date().toISOString();
  const pageOf = (key: string) => Math.max(1, parseInt(sp[key] || '1') || 1);
  const mqlPage = pageOf('mql_page');
  const inboundPage = pageOf('inbound_page');
  const discPage = pageOf('disc_page');
  const rangeFor = (p: number) => [(p - 1) * PAGE_SIZE, (p - 1) * PAGE_SIZE + PAGE_SIZE - 1] as const;

  // ── MQL Outreach (owner: Sharjeel) ──────────────────────────────────────
  // Include rows where lead_status IS NULL — PostgreSQL NOT IN drops NULLs otherwise.
  // Only DISQUALIFIED statuses hide a lead from the MQL box. 'Contacted' / 'Attempted to
  // Contact' just mean the engine sent a WhatsApp message — those are still live MQLs that
  // Sharjeel must work, so they stay. (Engagement/advance is handled by the wa_state filter.)
  const MQL_EXCLUDE_STATUSES = ['Junk Lead', 'Lost Lead', 'Not Qualified'];
  const excludeList = `(${MQL_EXCLUDE_STATUSES.map(s => `"${s}"`).join(',')})`;
  const { data: mqlLeads, count: mqlCount } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, lead_stage, lead_status, wa_hotness, wa_reply_class, updated_at, followup_call_at', { count: 'exact' })
    .eq('lead_stage', 'MQL')
    .or(`lead_status.is.null,lead_status.not.in.${excludeList}`)
    // Exclude leads that have already engaged/advanced (replied, hot, queued, scheduled,
    // closed, etc.) — they belong in Gargi's inbound box, Pending Outreach, or are done.
    // Null-safe (NOT IN drops NULLs) so MQL leads with no wa_state still show.
    .or('wa_state.is.null,wa_state.not.in.("replied","replied_manual","wa_sla_escalated","wa_hot","wa_nurture","call_queued","call_follow_up","discovery_call","wa_cold","wa_junk","wa_closed","wa_sla_resolved","wa_idle")')
    .order('updated_at', { ascending: false })
    .range(...rangeFor(mqlPage));
  const mqlOutreachLeads = mqlLeads || [];

  // ── Inbound & Manual Replies (owner: Gargi) ─────────────────────────────
  // wa_state = 'replied' covers genuine WhatsApp inbound replies AND manual replies
  // (Instagram / Email / Direct WhatsApp) that Jonathan logs via the form below.
  // All manual-reply channels (WhatsApp / Instagram / Web Chat / Email) land here as
  // 'replied_manual'; genuine inbound WhatsApp replies are 'replied'; SLA-escalated
  // inbound leads ('wa_sla_escalated') are also just inbound messages, so they live here
  // too (the standalone Escalated section was removed).
  const { data: inbound, count: inboundCount } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, lead_stage, lead_status, wa_hotness, wa_reply_class, wa_last_inbound_at, followup_call_at, wa_state', { count: 'exact' })
    .or('lead_stage.in.("MQL+","MQL++"),wa_state.in.("replied","replied_manual","wa_sla_escalated","wa_hot","wa_nurture")')
    .order('wa_last_inbound_at', { ascending: false, nullsFirst: false })
    .range(...rangeFor(inboundPage));
  const inboundLeads = inbound || [];

  // Source map: latest manual_reply event per lead (Instagram / Email / Direct WhatsApp …)
  const sourceMap: Record<string, string> = {};
  if (inboundLeads.length > 0) {
    const { data: events } = await supabase
      .from('lead_events')
      .select('lead_id, payload, created_at')
      .eq('event_type', 'manual_reply')
      .in('lead_id', inboundLeads.map(l => l.id))
      .order('created_at', { ascending: false });
    for (const e of events ?? []) {
      const src = (e as any).payload?.source;
      if (src && !sourceMap[e.lead_id]) sourceMap[e.lead_id] = src;
    }
  }

  // ── Discovery Call Queue (owner: Gargi) ─────────────────────────────────
  // Due now = no callback scheduled OR callback time has passed (filtered in SQL so
  // pagination counts are correct).
  const { data: discovery, count: discCount } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, lead_stage, lead_status, wa_hotness, wa_reply_class, updated_at, followup_call_at, wa_state', { count: 'exact' })
    .or('lead_stage.eq."MQL+++",wa_state.eq.discovery_call')
    .or(`followup_call_at.is.null,followup_call_at.lte.${nowIso}`)
    .order('created_at', { ascending: false })
    .range(...rangeFor(discPage));
  const discoveryQueueLeads = discovery || [];

  // ── Jonathan's entry station — manual replies entered today (IST) ────────
  const istDayStart = new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30'
  ).toISOString();
  const { data: todayManual } = await supabase
    .from('lead_events')
    .select('lead_id, payload, created_at')
    .eq('event_type', 'manual_reply')
    .gte('created_at', istDayStart)
    .order('created_at', { ascending: false });
  const todayManualEvents = todayManual || [];
  const manualBySource: Record<string, number> = {};
  for (const e of todayManualEvents) {
    const s = (e as any).payload?.source || 'Other';
    manualBySource[s] = (manualBySource[s] || 0) + 1;
  }
  const manualEntryNames: Record<string, { name: string | null; phone: string }> = {};
  if (todayManualEvents.length > 0) {
    const { data: mLeads } = await supabase
      .from('leads').select('id, name, phone_normalised')
      .in('id', todayManualEvents.map(e => e.lead_id));
    for (const l of mLeads || []) manualEntryNames[l.id] = { name: l.name, phone: l.phone_normalised };
  }

  // ── Call-log derived maps (Called tag, attempt count, last note) ─────────
  const { data: callLogData } = await supabase
    .from('call_logs')
    .select('lead_id, contact_status, caller, notes')
    .order('called_at', { ascending: false });
  const { noAnswerCountMap, lastNoteMap, calledSet } = buildLogMaps(callLogData as any);

  // ── Today's call stats ──────────────────────────────────────────────────
  const today6am = new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T06:00:00+05:30'
  ).toISOString();
  const { data: todayCallLogs } = await supabase
    .from('call_logs').select('contact_status').gte('called_at', today6am);
  const callsAnswered = (todayCallLogs || []).filter(c => c.contact_status === 'answered').length;
  const callsNoAnswer = (todayCallLogs || []).filter(c => c.contact_status === 'no_answer').length;
  const callsCallBack = (todayCallLogs || []).filter(c => c.contact_status === 'call_back_later').length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">SLA Monitor</h1>
          <p className="text-sm text-gray-500 mt-1">
            Owned boxes — MQL (Sharjeel), Manual Reply Entry (Jonathan), Inbound &amp; Calls (Gargi), Discovery (Gargi).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/pending-outreach" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100">
            Pending Outreach <ChevronRight size={14} />
          </Link>
          <Link href="/admin/backlog" className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 hover:bg-rose-100">
            Backlog <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* ── Pipeline snapshot ─────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b bg-gray-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Snapshot</span>
          <span className="text-xs text-gray-400">Live counts · refreshes on page load</span>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 px-5 py-4 text-center">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">MQL · Sharjeel</p>
            <p className="text-3xl font-bold text-amber-700">{mqlCount ?? 0}</p>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 px-5 py-4 text-center">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Inbound · Gargi</p>
            <p className="text-3xl font-bold text-emerald-700">{inboundCount ?? 0}</p>
          </div>
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50/50 px-5 py-4 text-center">
            <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1">Discovery · Gargi</p>
            <p className="text-3xl font-bold text-purple-700">{discCount ?? 0}</p>
          </div>
          <div className="rounded-xl border-2 border-green-200 bg-green-50/50 px-5 py-4">
            <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-2">Today&apos;s Calls</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-gray-600">Connected</span><span className="text-sm font-bold text-green-600">{callsAnswered}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-gray-600">No answer</span><span className="text-sm font-bold text-gray-500">{callsNoAnswer}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-gray-600">Call back</span><span className="text-sm font-bold text-amber-600">{callsCallBack}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MQL OUTREACH (Sharjeel) ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            MQL Outreach <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{mqlCount ?? 0}</span>
          </h2>
          <BoxOwner name="Sharjeel" color="amber" />
          <span className="text-xs text-gray-400 ml-1">Sharjeel calls or messages — either works.</span>
          <TriggerCronButton cron="mql-sync" label="Sync from Zoho" />
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-amber-50/40 border-b text-xs text-gray-500 uppercase tracking-wider">
                {HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {mqlOutreachLeads.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No MQL leads pending outreach.</td></tr>
              ) : mqlOutreachLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-amber-50/20">
                  <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                  <LeadStatusCell status={lead.lead_status} />
                  <HotnessCell hotness={lead.wa_hotness} />
                  <td className={TH + ' text-xs text-gray-500'}>
                    Updated {formatIST(lead.updated_at)}
                    <MaybeNote note={lastNoteMap[lead.id]} />
                  </td>
                  <td className={TH}>
                    <MoveStageSelect leadId={lead.id} zohoLeadId={lead.zoho_lead_id} currentStage={lead.lead_stage ?? null} />
                  </td>
                  <td className={TH + ' text-right'}>
                    <CallLogWrapper lead={lead} queueType="mql_outreach" noAnswerCount={noAnswerCountMap[lead.id] ?? 0} showMessage defaultCaller="Sharjeel" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager basePath={BASE} params={sp} pageParam="mql_page" page={mqlPage} total={mqlCount ?? 0} />
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* ── JONATHAN — MANUAL REPLY ENTRY STATION ──────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Manual Reply Entry</h2>
          <BoxOwner name="Jonathan" color="blue" />
          <span className="text-xs text-gray-400 ml-1">Log replies from any channel — they flow to Gargi&apos;s call queue.</span>
        </div>

        <ManualReplyForm />

        <div className="mt-4 bg-white border border-sky-200 rounded-lg overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b bg-sky-50/50 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Entered today</span>
            <span className="text-xs font-bold text-sky-700">{todayManualEvents.length}</span>
            {['Direct WhatsApp', 'Instagram', 'Web Chat', 'Email'].map(s => (
              <span key={s} className="text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{s}: {manualBySource[s] || 0}</span>
            ))}
          </div>
          {todayManualEvents.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">No manual replies entered today yet.</div>
          ) : (
            <ul className="divide-y">
              {todayManualEvents.slice(0, 30).map((e, i) => {
                const info = manualEntryNames[e.lead_id];
                const p = (e as any).payload || {};
                return (
                  <li key={i} className="px-4 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{info?.name || '—'} <span className="text-gray-400 font-mono text-xs">{info?.phone || ''}</span></span>
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold bg-sky-100 text-sky-700 rounded px-1.5 py-0.5">{p.source || 'Other'}</span>
                        <span className="text-xs text-gray-400">{formatIST(e.created_at)}</span>
                      </span>
                    </div>
                    {p.message_sent && <div className="text-xs text-gray-500 mt-0.5"><span className="font-semibold text-gray-400">Sent:</span> {p.message_sent}</div>}
                    {p.reply_received && <div className="text-xs text-gray-700 mt-0.5"><span className="font-semibold text-emerald-600">Reply:</span> {p.reply_received}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* ── GARGI — INBOUND & CALLS ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Inbound &amp; Calls <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{inboundCount ?? 0}</span>
          </h2>
          <BoxOwner name="Gargi" color="purple" />
          <span className="text-xs text-gray-400 ml-1">MQL+ / MQL++ replies to call.</span>
        </div>

        <div className="bg-white border border-emerald-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-emerald-50/40 border-b text-xs text-gray-500 uppercase tracking-wider">
                {HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {inboundLeads.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No inbound or manual replies waiting.</td></tr>
              ) : inboundLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-emerald-50/20">
                  <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} source={sourceMap[lead.id]} />
                  <LeadStatusCell status={lead.lead_status} />
                  <HotnessCell hotness={lead.wa_hotness} />
                  <td className={TH + ' text-xs text-gray-500 whitespace-nowrap'}>
                    Replied {formatIST(lead.wa_last_inbound_at)}
                    <MaybeNote note={lastNoteMap[lead.id]} />
                  </td>
                  <td className={TH}>
                    <MoveStageSelect leadId={lead.id} zohoLeadId={lead.zoho_lead_id} currentStage={lead.lead_stage ?? null} />
                  </td>
                  <td className={TH + ' text-right'}>
                    <CallLogWrapper lead={lead} queueType="whatsapp_reply" noAnswerCount={noAnswerCountMap[lead.id] ?? 0} showMessage defaultCaller="Gargi" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager basePath={BASE} params={sp} pageParam="inbound_page" page={inboundPage} total={inboundCount ?? 0} />
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* ── DISCOVERY CALL QUEUE (Gargi) ──────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Discovery Call Queue <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{discCount ?? 0}</span>
          </h2>
          <BoxOwner name="Gargi" color="purple" />
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-purple-50/30 border-b text-xs text-gray-500 uppercase tracking-wider">
                {HEADERS.map(h => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {discoveryQueueLeads.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No discovery calls pending.</td></tr>
              ) : discoveryQueueLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50/50">
                  <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
                  <LeadStatusCell status={lead.lead_status} />
                  <HotnessCell hotness={lead.wa_hotness} />
                  <td className={TH + ' text-xs text-gray-500'}>
                    {/* Callback date is shown inline in the lead cell — avoid duplicating it here */}
                    Updated {formatIST(lead.updated_at)}
                    <MaybeNote note={lastNoteMap[lead.id]} />
                  </td>
                  <td className={TH}>
                    <MoveStageSelect leadId={lead.id} zohoLeadId={lead.zoho_lead_id} currentStage={lead.lead_stage ?? null} />
                  </td>
                  <td className={TH + ' text-right'}>
                    <CallLogWrapper lead={lead} queueType="discovery_call" noAnswerCount={noAnswerCountMap[lead.id] ?? 0} defaultCaller="Gargi" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager basePath={BASE} params={sp} pageParam="disc_page" page={discPage} total={discCount ?? 0} />
        </div>
      </section>
    </div>
  );
}
