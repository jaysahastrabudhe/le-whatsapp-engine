import { supabase } from '@/lib/supabase';
import { SlaResolveButton } from '@/components/SlaResolveButton';
import ManualReplyForm from '@/components/ManualReplyForm';
import CallLogWrapper from '@/components/CallLogWrapper';

export const revalidate = 0;

function formatIST(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatISTShort(ts: string | null) {
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
  const label = hrs > 0
    ? `${hrs}h ${rem}m`
    : `${mins}m`;
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
};

export default async function SLAMonitorPage() {
  const now = new Date().getTime();

  // 1. Fetch Call Queue & Discovery Queue (Unified Call Tracking)
  const { data: callTracking } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, call_assigned_to, updated_at, wa_state, followup_call_at, wa_hotness')
    .in('wa_state', ['call_queued', 'call_follow_up', 'discovery_call'])
    .order('updated_at', { ascending: false });

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

  // 2. Existing WhatsApp SLAs (Active)
  const { data: active } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, owner_email, wa_hotness, wa_reply_class, wa_human_response_due_at')
    .not('wa_human_response_due_at', 'is', null)
    .not('wa_state', 'in', '("wa_closed","wa_sla_escalated","wa_sla_resolved")')
    .order('wa_human_response_due_at', { ascending: true });

  // 3. Existing WhatsApp SLAs (Escalated)
  const { data: escalated } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, owner_email, wa_hotness, wa_reply_class, updated_at')
    .eq('wa_state', 'wa_sla_escalated')
    .order('updated_at', { ascending: false })
    .limit(20);

  const activeLeads   = active   || [];
  const escalatedLeads = escalated || [];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">SLA Monitor & Call Queues</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage human responses for WhatsApp replies and handle the manual Call Tracking pipeline.
        </p>
      </div>

      <ManualReplyForm />

      <hr className="border-gray-200" />

      {/* CALL QUEUE */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Call Queue <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{callQueueLeads.length}</span>
          </h2>
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Queued Since</th>
                <th className="px-4 py-3">Assigned Caller</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {callQueueLeads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    Call Queue is empty.
                  </td>
                </tr>
              ) : callQueueLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                       {lead.name || '—'}
                       {lead.wa_hotness && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>{lead.wa_hotness}</span>}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lead.followup_call_at 
                      ? <span className="text-amber-600">Follow-up due since {formatISTShort(lead.followup_call_at)}</span>
                      : formatISTShort(lead.updated_at)
                    }
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {lead.call_assigned_to ? <span className="font-medium">{lead.call_assigned_to}</span> : <span className="text-gray-400 italic">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end">
                    <CallLogWrapper lead={lead} queueType="call_queue" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* DISCOVERY QUEUE */}
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
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Last Caller</th>
                <th className="px-4 py-3">Moved At / Due Since</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {discoveryQueueLeads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    No discovery calls pending.
                  </td>
                </tr>
              ) : discoveryQueueLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{lead.name || '—'}</div>
                    <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-medium">
                    {lead.call_assigned_to || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lead.followup_call_at 
                      ? <span className="text-amber-600">Follow-up due since {formatISTShort(lead.followup_call_at)}</span>
                      : formatISTShort(lead.updated_at)
                    }
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end">
                    <CallLogWrapper lead={lead} queueType="discovery_call" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* WHATSAPP SLAs (Active) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              WhatsApp Replies — Awaiting Response <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{activeLeads.length}</span>
            </h2>
          </div>
          {activeLeads.filter(l => new Date(l.wa_human_response_due_at!).getTime() < Date.now()).length > 0 && (
             <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
               {activeLeads.filter(l => new Date(l.wa_human_response_due_at!).getTime() < Date.now()).length} breached
             </span>
          )}
        </div>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-green-50/30 border-b text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Reply Type</th>
                <th className="px-4 py-3">Assigned To</th>
                <th className="px-4 py-3">SLA Due</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {activeLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No active SLAs — all caught up.
                  </td>
                </tr>
              ) : activeLeads.map((lead) => {
                const { label, breached } = timeRemaining(lead.wa_human_response_due_at!);
                return (
                  <tr key={lead.id} className={`border-b hover:bg-gray-50/50 ${breached ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.name || '—'}</div>
                      <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {lead.wa_hotness && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>
                            {lead.wa_hotness}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {CLASS_LABELS[lead.wa_reply_class || ''] || lead.wa_reply_class || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {lead.owner_email || <span className="text-orange-500 text-xs">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatIST(lead.wa_human_response_due_at!)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold text-sm ${breached ? 'text-red-600' : 'text-green-600'}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SlaResolveButton leadId={lead.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Escalated */}
      {escalatedLeads.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Escalated — Zoho Task Created <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{escalatedLeads.length}</span>
            </h2>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-red-50/30 border-b text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Reply Type</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Escalated At</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {escalatedLeads.map((lead) => (
                  <tr key={lead.id} className="border-b hover:bg-gray-50/50 bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.name || '—'}</div>
                      <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {lead.wa_hotness && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>
                            {lead.wa_hotness}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {CLASS_LABELS[lead.wa_reply_class || ''] || lead.wa_reply_class || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {lead.owner_email || <span className="text-orange-500 text-xs">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatIST(lead.updated_at)}
                    </td>
                    <td className="px-4 py-3">
                      <SlaResolveButton leadId={lead.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
