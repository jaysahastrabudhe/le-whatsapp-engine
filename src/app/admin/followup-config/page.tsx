import { supabase } from '@/lib/supabase';
import { getApprovedTemplates } from '@/lib/twilio/templates';
import { FollowupForm } from './FollowupForm';
import { FOLLOWUP_DEFAULTS } from '@/app/api/admin/followup-config/route';

export const revalidate = 0;

export default async function FollowupConfigPage() {
  const [configResult, templates] = await Promise.all([
    supabase.from('followup_config').select('*').eq('id', 1).single(),
    getApprovedTemplates().catch(() => []),
  ]);

  const config = configResult.data ?? FOLLOWUP_DEFAULTS;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Follow-up Logic</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure the timing and templates for automated follow-up messages.
          Changes take effect on the next daily cron run (11:30 AM IST).
        </p>
      </div>

      {configResult.error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Migration required.</strong> The <code className="font-mono bg-amber-100 px-1 rounded">followup_config</code> table doesn&apos;t exist yet.
          Run <code className="font-mono bg-amber-100 px-1 rounded">supabase/migrations/20260330_followup_config.sql</code> in your Supabase Dashboard → SQL Editor.
          Showing defaults for now — saves will fail until the migration is applied.
        </div>
      )}

      <FollowupForm
        initial={{
          rule5_enabled:     config.rule5_enabled    ?? FOLLOWUP_DEFAULTS.rule5_enabled,
          rule5_delay_hours: config.rule5_delay_hours ?? FOLLOWUP_DEFAULTS.rule5_delay_hours,
          rule5_template:    config.rule5_template    ?? FOLLOWUP_DEFAULTS.rule5_template,
          rule6_enabled:     config.rule6_enabled    ?? FOLLOWUP_DEFAULTS.rule6_enabled,
          rule6_delay_hours: config.rule6_delay_hours ?? FOLLOWUP_DEFAULTS.rule6_delay_hours,
          rule6a_template:   config.rule6a_template   ?? FOLLOWUP_DEFAULTS.rule6a_template,
          rule6b_template:   config.rule6b_template   ?? FOLLOWUP_DEFAULTS.rule6b_template,
        }}
        templates={templates.map((t) => ({ name: t.name, sid: t.sid }))}
      />
    </div>
  );
}
