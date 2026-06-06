import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import CallLogWrapper from '@/components/CallLogWrapper';
import {
  TH, formatIST, buildLogMaps,
  MaybeNote, LeadCell, LeadStatusCell, HotnessCell,
} from '@/components/admin/leadCells';
import { ChevronLeft } from 'lucide-react';

export const revalidate = 0;

const SYSTEM_LAUNCH = '2026-04-21T00:00:00+05:30';

export default async function BacklogPage() {
  const now = Date.now();

  // Backlog A: replied (post-launch) but never called
  const { data: backlogReplied } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_last_inbound_at, wa_reply_class, wa_hotness, lead_status, wa_state, followup_call_at')
    .eq('wa_state', 'replied')
    .not('wa_last_inbound_at', 'is', null)
    .gte('wa_last_inbound_at', SYSTEM_LAUNCH)
    .order('wa_last_inbound_at', { ascending: true });

  // Backlog B: scheduled follow-ups 3+ days overdue
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: backlogOverdue } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, followup_call_at, wa_reply_class, wa_hotness, lead_status, wa_state')
    .in('wa_state', ['call_follow_up', 'discovery_call'])
    .not('followup_call_at', 'is', null)
    .lt('followup_call_at', threeDaysAgo)
    .order('followup_call_at', { ascending: true });

  // Escalated (SLA breach → Zoho task raised)
  const { data: escalated } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_hotness, wa_reply_class, lead_status, updated_at, followup_call_at')
    .eq('wa_state', 'wa_sla_escalated')
    .order('updated_at', { ascending: false })
    .limit(50);

  // Nurture (soft "not now")
  const { data: nurture } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, wa_last_inbound_at, wa_reply_class, wa_hotness, lead_status, followup_call_at')
    .eq('wa_state', 'wa_nurture')
    .order('wa_last_inbound_at', { ascending: false });

  const backlogRepliedLeads = backlogReplied || [];
  const backlogOverdueLeads = backlogOverdue || [];
  const escalatedLeads = escalated || [];
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
  const Table = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
            {headers.map(h => <th key={h} className={h === 'Action' ? TH + ' text-right' : TH}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <Link href="/admin/sla-monitor" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 mb-2">
          <ChevronLeft size={14} /> SLA Monitor
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Backlog &amp; Escalations</h1>
        <p className="text-sm text-gray-500 mt-1">Leads that slipped through — replies never called, missed follow-ups, escalations, and nurture.</p>
      </div>

      {/* Escalated */}
      {escalatedLeads.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Escalated — Zoho Task Created
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">{escalatedLeads.length}</span>
          </h2>
          <Table>
            {escalatedLeads.map(lead => (
              <Row key={lead.id} lead={lead} context={<span className="text-red-600 font-medium">Escalated {formatIST(lead.updated_at)}</span>} queueType="call_queue" />
            ))}
          </Table>
        </section>
      )}

      {/* Backlog A */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" /> WA Replied — No Call Made
          <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs">{backlogRepliedLeads.length}</span>
        </h2>
        {backlogRepliedLeads.length === 0 ? (
          <div className="bg-white border rounded-lg px-4 py-8 text-center text-gray-400 text-sm">None — all replies have been called. 🎉</div>
        ) : (
          <Table>
            {backlogRepliedLeads.map(lead => (
              <Row key={lead.id} lead={lead} context={<span className="text-rose-600 font-medium">Replied {formatIST(lead.wa_last_inbound_at)}</span>} />
            ))}
          </Table>
        )}
      </section>

      {/* Backlog B */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> Missed Follow-ups — 3+ Days Overdue
          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">{backlogOverdueLeads.length}</span>
        </h2>
        {backlogOverdueLeads.length === 0 ? (
          <div className="bg-white border rounded-lg px-4 py-8 text-center text-gray-400 text-sm">None — follow-ups are on track. 🎉</div>
        ) : (
          <Table>
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
      {nurtureLeads.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400" /> Nurture — Not Now
            <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-xs">{nurtureLeads.length}</span>
          </h2>
          <Table>
            {nurtureLeads.map(lead => (
              <Row key={lead.id} lead={lead} context={<span className="text-gray-500">Last reply {formatIST(lead.wa_last_inbound_at)}</span>} />
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
