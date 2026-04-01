import { supabase } from '@/lib/supabase';
import { SlaResolveButton } from '@/components/SlaResolveButton';

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
  const label = hrs > 0
    ? `${hrs}h ${rem}m`
    : `${mins}m`;
  return { label: breached ? `Breached by ${label}` : `${label} left`, breached };
}

const HOTNESS_STYLES: Record<string, string> = {
  hot:  'bg-red-100 text-red-800',
  warm: 'bg-orange-100 text-orange-800',
};

const CLASS_LABELS: Record<string, string> = {
  interested:   'Interested',
  fee_question: 'Fee Question',
};

export default async function SLAMonitorPage() {
  // Active SLAs — timer still running
  const { data: active } = await supabase
    .from('leads')
    .select('id, name, phone_normalised, zoho_lead_id, owner_email, wa_hotness, wa_reply_class, wa_human_response_due_at')
    .not('wa_human_response_due_at', 'is', null)
    .not('wa_state', 'in', '("wa_closed","wa_sla_escalated","wa_sla_resolved")')
    .order('wa_human_response_due_at', { ascending: true });

  // Escalated — breached and Zoho task created, not yet resolved
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">SLA Monitor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Hot and warm leads requiring a human response within 2 hours of replying.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{activeLeads.length}</div>
          <div className="text-sm text-gray-500 mt-0.5">Active SLAs</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-700">
            {activeLeads.filter(l => new Date(l.wa_human_response_due_at!).getTime() < Date.now()).length}
          </div>
          <div className="text-sm text-red-500 mt-0.5">Breached</div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-700">{escalatedLeads.length}</div>
          <div className="text-sm text-amber-600 mt-0.5">Escalated (awaiting resolution)</div>
        </div>
      </div>

      {/* Active SLAs */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Active — Awaiting Response
        </h2>
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
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
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Escalated — Zoho Task Created
          </h2>
          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
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
