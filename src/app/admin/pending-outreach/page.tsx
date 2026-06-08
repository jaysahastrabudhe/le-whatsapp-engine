import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import CallLogWrapper from '@/components/CallLogWrapper';
import {
  TH, UNIFIED_HEADERS, PAGE_SIZE, formatIST, timeRemaining, buildLogMaps, istDayBounds,
  MaybeNote, Pager, DateFilter, LeadCell, LeadStatusCell, HotnessCell,
} from '@/components/admin/leadCells';
import { ChevronLeft } from 'lucide-react';

export const revalidate = 0;

const BASE = '/admin/pending-outreach';

export default async function PendingOutreachPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1') || 1);
  const dateFilter = sp.date;
  const day = istDayBounds(dateFilter);
  const now = Date.now();

  // Call queue: call_queued + overdue call_follow_up
  let cqQuery = supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, lead_status, wa_reply_class, created_at, wa_state, followup_call_at, wa_hotness')
    .in('wa_state', ['call_queued', 'call_follow_up']);
  if (day) cqQuery = cqQuery.gte('created_at', day.start).lte('created_at', day.end);
  const { data: callTracking } = await cqQuery.order('created_at', { ascending: false });
  const callQueueLeads = (callTracking || []).filter(l => {
    if (l.wa_state === 'call_queued') return true;
    if (l.wa_state === 'call_follow_up' && l.followup_call_at && new Date(l.followup_call_at).getTime() <= now) return true;
    return false;
  });

  // Active WhatsApp SLAs (open response timer, not terminal/escalated)
  let activeQuery = supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, owner_email, wa_hotness, wa_reply_class, lead_status, wa_human_response_due_at, followup_call_at')
    .not('wa_human_response_due_at', 'is', null)
    // NULL-safe exclusion: NOT IN drops NULL rows, so include them explicitly via .or
    .or('wa_state.is.null,wa_state.not.in.("wa_closed","wa_idle","wa_sla_escalated","wa_sla_resolved","replied","replied_manual")');
  if (day) activeQuery = activeQuery.gte('wa_human_response_due_at', day.start).lte('wa_human_response_due_at', day.end);
  const { data: active } = await activeQuery.order('wa_human_response_due_at', { ascending: true });

  const { data: callLogData } = await supabase
    .from('call_logs').select('lead_id, contact_status, caller, notes').order('called_at', { ascending: false });
  const { noAnswerCountMap, lastNoteMap, calledSet } = buildLogMaps(callLogData as any);

  const callQueueMapped = callQueueLeads.map(lead => ({
    ...lead, listType: 'manual_call' as const,
    sortTime: lead.followup_call_at
      ? new Date(lead.followup_call_at).getTime()
      : new Date('2030-01-01').getTime() * 2 - new Date(lead.created_at).getTime(),
  }));
  const activeMapped = (active || []).map(lead => ({
    ...lead, listType: 'whatsapp_reply' as const,
    sortTime: new Date(lead.wa_human_response_due_at!).getTime(),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allLeads: any[] = [...callQueueMapped, ...activeMapped].sort((a, b) => a.sortTime - b.sortTime);
  const total = allLeads.length;
  const combinedLeads = allLeads.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);
  const breached = activeMapped.filter(l => new Date(l.wa_human_response_due_at!).getTime() < now).length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/sla-monitor" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 mb-2">
            <ChevronLeft size={14} /> SLA Monitor
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pending Outreach</h1>
          <p className="text-sm text-gray-500 mt-1">Leads waiting to be called — the call queue plus active WhatsApp response SLAs.</p>
        </div>
        <DateFilter basePath={BASE} date={dateFilter} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Pending Outreach <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{total}</span>
            </h2>
          </div>
          {breached > 0 && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{breached} SLA breached</span>
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
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No pending outreach — all caught up.</td></tr>
              ) : combinedLeads.map((lead) => {
                const isWhatsApp = lead.listType === 'whatsapp_reply';
                let contextLabel = '';
                let isBreached = false;
                if (isWhatsApp) {
                  const r = timeRemaining(lead.wa_human_response_due_at!);
                  contextLabel = r.label; isBreached = r.breached;
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
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isWhatsApp ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                          {isWhatsApp ? 'WA Reply' : 'Call Queue'}
                        </span>
                        <span className={`text-xs ${isBreached ? 'text-red-600 font-bold' : 'text-gray-500'} whitespace-nowrap`}>{contextLabel}</span>
                      </div>
                      <MaybeNote note={lastNoteMap[lead.id]} />
                    </td>
                    <td className={TH + ' text-right'}>
                      <CallLogWrapper lead={lead} queueType={isWhatsApp ? 'whatsapp_reply' : 'call_queue'} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} defaultCaller="Jonathan" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager basePath={BASE} params={sp} pageParam="page" page={page} total={total} />
        </div>
      </section>
    </div>
  );
}
