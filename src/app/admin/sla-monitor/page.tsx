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

  const scheduledLeads = allCallLeads.filter(l => {
    if (l.followup_call_at && new Date(l.followup_call_at).getTime() > now) return true;
    return false;
  }).sort((a, b) => new Date(a.followup_call_at!).getTime() - new Date(b.followup_call_at!).getTime());

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

  const activeLeads = active || [];
  const escalatedLeads = escalated || [];

  // Combine Active SLAs and Call Queue
  const callQueueLeadsMapped = callQueueLeads.map(lead => ({
    ...lead,
    listType: 'manual_call',
    sortTime: lead.followup_call_at ? new Date(lead.followup_call_at).getTime() : new Date(lead.updated_at).getTime(),
  }));

  const activeLeadsMapped = activeLeads.map(lead => ({
    ...lead,
    listType: 'whatsapp_reply',
    sortTime: new Date(lead.wa_human_response_due_at!).getTime(),
  }));

  // Sort ascending by time (most urgent / oldest first)
  const combinedLeads = [...callQueueLeadsMapped, ...activeLeadsMapped].sort((a, b) => a.sortTime - b.sortTime);

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

      {/* 1. ESCALATED (TOP PRIORITY) */}
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
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Reply Type</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Escalated At</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {escalatedLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-red-100/50 hover:bg-red-50/40 bg-white">
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
                    <td className="px-4 py-3 text-xs text-red-600 whitespace-nowrap font-medium">
                      {formatIST(lead.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right flex justify-end">
                      <CallLogWrapper lead={lead} queueType="whatsapp_reply" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. COMBINED QUEUE (CALL QUEUE + WHATSAPP REPLIES) */}
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
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status / Wait Time</th>
                <th className="px-4 py-3">Assigned To</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {combinedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No pending outreach — all caught up.
                  </td>
                </tr>
              ) : combinedLeads.map((lead) => {
                const isWhatsApp = lead.listType === 'whatsapp_reply';
                
                let timeLabel = '';
                let isBreached = false;
                
                if (isWhatsApp) {
                  const r = timeRemaining(lead.wa_human_response_due_at!);
                  timeLabel = r.label;
                  isBreached = r.breached;
                } else {
                  timeLabel = lead.followup_call_at 
                      ? `Follow-up due since ${formatISTShort(lead.followup_call_at)}`
                      : `Queued since ${formatISTShort(lead.updated_at)}`;
                }

                return (
                  <tr key={lead.id} className={`border-b hover:bg-gray-50/50 ${isBreached ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                       {lead.name || '—'}
                       {lead.wa_hotness && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>{lead.wa_hotness}</span>}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isWhatsApp ? (
                         <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">WhatsApp Reply</span>
                      ) : (
                         <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">Manual Call Queue</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 align-middle">
                        {isWhatsApp && lead.wa_reply_class && (
                          <span className="text-xs text-gray-500 mr-2 border border-gray-200 px-1 rounded bg-white whitespace-nowrap">
                            {CLASS_LABELS[lead.wa_reply_class] || lead.wa_reply_class}
                          </span>
                        )}
                        <span className={`text-xs ${isBreached ? 'text-red-600 font-bold' : 'text-gray-500'} whitespace-nowrap`}>
                          {timeLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {isWhatsApp 
                        ? (lead.owner_email || <span className="text-orange-500 text-xs">Unassigned</span>) 
                        : (lead.call_assigned_to ? <span className="font-medium">{lead.call_assigned_to}</span> : <span className="text-gray-400 italic">Unassigned</span>)
                      }
                    </td>
                    <td className="px-4 py-3 text-right flex justify-end">
                      <CallLogWrapper lead={lead} queueType={isWhatsApp ? 'whatsapp_reply' : 'call_queue'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* 3. DISCOVERY QUEUE */}
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
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                       {lead.name || '—'}
                       {lead.wa_hotness && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>{lead.wa_hotness}</span>}
                    </div>
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

      {/* 4. SCHEDULED CALLBACKS */}
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
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Type / State</th>
                <th className="px-4 py-3">Scheduled For</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {scheduledLeads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    No future callbacks scheduled.
                  </td>
                </tr>
              ) : scheduledLeads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                       {lead.name || '—'}
                       {lead.wa_hotness && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>{lead.wa_hotness}</span>}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{lead.phone_normalised}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                      lead.wa_state === 'discovery_call' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {lead.wa_state === 'discovery_call' ? 'Discovery' : 'General Call'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-blue-600 font-medium">
                    {formatIST(lead.followup_call_at)}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end">
                    <CallLogWrapper lead={lead} queueType={lead.wa_state === 'discovery_call' ? 'discovery_call' : 'whatsapp_reply'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-gray-200 mt-12 mb-8" />

      {/* WORKFLOW GUIDE */}
      <section className="bg-blue-50 border border-blue-100 rounded-lg p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-4">🚀 Daily Operations Workflow</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="space-y-4 text-sm text-blue-800">
              <p><strong>Step 1: Check Escalated</strong><br/>Handle the breached 🔴 Escalated leads first to clear Zoho task penalties.</p>
              
              <p><strong>Step 2: Dial Pending Outreach</strong><br/>Call the people in the blue/green queue. Logging a call with "Set up discovery call" moves them to Step 3. <em>(Logging a call exactly this way also stops the WhatsApp SLA timer automatically!).</em></p>
              
              <p><strong>Step 3: Conduct Discoveries</strong><br/>Call the high-value leads waiting in the Discovery Queue. When they are sold, hit Update &rarr; "Ready to Fill Form" to clear them off the board!</p>
              
              <p className="bg-white/60 p-3 rounded text-xs italic">
                Tip: If a lead needs time, select "Follow up later". They will vanish out of your way and pop back onto the board automatically on the date you choose.
              </p>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-100 overflow-x-auto text-xs font-mono">
            {'Pending Outreach --> [Log Call] --> Discovery Queue --> [Update] --> Resolved'}
          </div>
        </div>
      </section>
    </div>
  );
}
