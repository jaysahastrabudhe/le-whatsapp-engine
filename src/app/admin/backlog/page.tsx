import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import CallLogWrapper from '@/components/CallLogWrapper';
import {
  TH, PAGE_SIZE, formatIST, buildLogMaps,
  MaybeNote, Pager, LeadCell, LeadStatusCell, HotnessCell,
} from '@/components/admin/leadCells';
import { ChevronLeft } from 'lucide-react';

export const revalidate = 0;

const BASE = '/admin/backlog';
const SYSTEM_LAUNCH = '2026-04-21T00:00:00+05:30';

export default async function BacklogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const now = Date.now();
  const pageOf = (key: string) => Math.max(1, parseInt(sp[key] || '1') || 1);
  const rangeFor = (p: number) => [(p - 1) * PAGE_SIZE, (p - 1) * PAGE_SIZE + PAGE_SIZE - 1] as const;
  const aPage = pageOf('a_page');
  const bPage = pageOf('b_page');
  const nPage = pageOf('n_page');

  // Backlog A: replied (post-launch) but never called — the AGING view of the inbound
  // box (includes manual replies). Overlaps intentionally with the live Inbound box.
  const { data: backlogReplied, count: aCount } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_last_inbound_at, wa_reply_class, wa_hotness, lead_status, wa_state, followup_call_at', { count: 'exact' })
    .in('wa_state', ['replied', 'replied_manual'])
    .not('wa_last_inbound_at', 'is', null)
    .gte('wa_last_inbound_at', SYSTEM_LAUNCH)
    .order('wa_last_inbound_at', { ascending: true })
    .range(...rangeFor(aPage));

  // Backlog B: scheduled call follow-ups 3+ days overdue. Discovery callbacks are owned
  // by Gargi's Discovery box (any age), so they're excluded here to avoid double-listing.
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: backlogOverdue, count: bCount } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, followup_call_at, wa_reply_class, wa_hotness, lead_status, wa_state', { count: 'exact' })
    .eq('wa_state', 'call_follow_up')
    .not('followup_call_at', 'is', null)
    .lt('followup_call_at', threeDaysAgo)
    .order('followup_call_at', { ascending: true })
    .range(...rangeFor(bPage));

  // Nurture (soft "not now")
  const { data: nurture, count: nCount } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_last_inbound_at, wa_reply_class, wa_hotness, lead_status, followup_call_at', { count: 'exact' })
    .eq('wa_state', 'wa_nurture')
    .order('wa_last_inbound_at', { ascending: false })
    .range(...rangeFor(nPage));

  const backlogRepliedLeads = backlogReplied || [];
  const backlogOverdueLeads = backlogOverdue || [];
  const nurtureLeads = nurture || [];

  const { data: callLogData } = await supabase
    .from('call_logs').select('lead_id, contact_status, caller, notes').order('called_at', { ascending: false });
  const { noAnswerCountMap, lastNoteMap, calledSet } = buildLogMaps(callLogData as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Row = ({ lead, context, queueType = 'call_queue' as const }: { lead: any; context: React.ReactNode; queueType?: 'call_queue' | 'discovery_call' }) => (
    <tr className="border-b hover:bg-gray-50/40">
      <LeadCell lead={lead} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} called={calledSet.has(lead.id)} />
      <LeadStatusCell status={lead.lead_status} />
      <HotnessCell hotness={lead.wa_hotness} />
      <td className={TH + ' text-xs whitespace-nowrap'}>{context}<MaybeNote note={lastNoteMap[lead.id]} /></td>
      <td className={TH + ' text-right'}>
        <CallLogWrapper lead={lead} queueType={lead.wa_state === 'discovery_call' ? 'discovery_call' : queueType} noAnswerCount={noAnswerCountMap[lead.id] ?? 0} defaultCaller="Jonathan" />
      </td>
    </tr>
  );

  const headers = ['Lead', 'Status', 'Hotness', 'Context', 'Action'];
  const Table = ({ children, pageParam, page, total }: { children: React.ReactNode; pageParam: string; page: number; total: number }) => (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
            {headers.map(h => <th key={h} className={h === 'Action' ? TH + ' text-right' : TH}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      <Pager basePath={BASE} params={sp} pageParam={pageParam} page={page} total={total} />
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <Link href="/admin/sla-monitor" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft size={14} /> SLA Monitor
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Backlog</h1>
        <p className="text-sm text-gray-500 mt-1">Leads that slipped through — aging replies never called, missed follow-ups, and nurture.</p>
      </div>

      {/* Backlog A */}
      <section id="a_page">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" /> WA Replied — Aging (no call yet)
          <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs">{aCount ?? 0}</span>
        </h2>
        {(aCount ?? 0) === 0 ? (
          <div className="bg-white border rounded-lg px-4 py-8 text-center text-gray-400 text-sm">None — all replies have been called. 🎉</div>
        ) : (
          <Table pageParam="a_page" page={aPage} total={aCount ?? 0}>
            {backlogRepliedLeads.map(lead => (
              <Row key={lead.id} lead={lead} context={<span className="text-rose-600 font-medium">Replied {formatIST(lead.wa_last_inbound_at)}</span>} />
            ))}
          </Table>
        )}
      </section>

      {/* Backlog B */}
      <section id="b_page">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> Missed Follow-ups — 3+ Days Overdue
          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">{bCount ?? 0}</span>
        </h2>
        {(bCount ?? 0) === 0 ? (
          <div className="bg-white border rounded-lg px-4 py-8 text-center text-gray-400 text-sm">None — follow-ups are on track. 🎉</div>
        ) : (
          <Table pageParam="b_page" page={bPage} total={bCount ?? 0}>
            {backlogOverdueLeads.map(lead => {
              const daysOverdue = Math.floor((now - new Date(lead.followup_call_at!).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <Row key={lead.id} lead={lead} queueType="call_queue" context={
                  <><span className="text-orange-600 font-semibold">{daysOverdue}d overdue</span><span className="text-gray-400 ml-1">· {formatIST(lead.followup_call_at)}</span></>
                } />
              );
            })}
          </Table>
        )}
      </section>

      {/* Nurture */}
      {(nCount ?? 0) > 0 && (
        <section id="n_page">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400" /> Nurture — Not Now
            <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-xs">{nCount ?? 0}</span>
          </h2>
          <Table pageParam="n_page" page={nPage} total={nCount ?? 0}>
            {nurtureLeads.map(lead => (
              <Row key={lead.id} lead={lead} context={<span className="text-gray-500">Last reply {formatIST(lead.wa_last_inbound_at)}</span>} />
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
