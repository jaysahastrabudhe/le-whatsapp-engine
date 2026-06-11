import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enqueueOutboundMessage } from '@/lib/queue/client';
import { getTwilioTemplateSid } from '@/lib/twilio/templates';
import { isWithinSendWindow } from '@/lib/engine/sessionWindow';
import { FOLLOWUP_DEFAULTS } from '@/app/api/admin/followup-config/route';

const PRIMARY_SENDER = '+917709333161';

async function getFollowupConfig() {
  const { data } = await supabase.from('followup_config').select('*').eq('id', 1).single();
  return { ...FOLLOWUP_DEFAULTS, ...data };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!isWithinSendWindow()) {
    return NextResponse.json({ success: true, skipped: 'outside send window' });
  }

  console.log('[Cron] Follow-up sweep starting...');

  const cfg = await getFollowupConfig();
  const now = Date.now();
  const rule5cutoff = new Date(now - cfg.rule5_delay_hours * 60 * 60 * 1000).toISOString();
  const rule6cutoff = new Date(now - cfg.rule6_delay_hours * 60 * 60 * 1000).toISOString();
  const results: string[] = [];

  // ── Rule 5: no-reply follow-up ────────────────────────────────────────────
  if (!cfg.rule5_enabled) {
    console.log('[Cron Rule5] Disabled — skipping.');
  } else {
    const { data: rule5Leads } = await supabase
      .from('leads')
      .select('id, phone_normalised, name')
      .eq('wa_state', 'first_sent')
      .eq('wa_opt_in', true)
      .lt('wa_last_outbound_at', rule5cutoff)
      .is('wa_last_inbound_at', null)
      .limit(50);

    for (const lead of rule5Leads ?? []) {
      try {
        const contentSid = await getTwilioTemplateSid(cfg.rule5_template);
        if (!contentSid) {
          console.warn(`[Cron Rule5] ${cfg.rule5_template} SID not found — skipping ${lead.phone_normalised}`);
          continue;
        }
        const { error: stateErr } = await supabase
          .from('leads')
          .update({
            wa_state:            'followup_sent',
            wa_last_outbound_at: new Date().toISOString(),
            wa_last_template:    cfg.rule5_template,
          })
          .eq('id', lead.id)
          .eq('wa_state', 'first_sent');

        if (stateErr) {
          console.warn(`[Cron Rule5] Optimistic lock failed for ${lead.phone_normalised} — skipping`);
          continue;
        }

        await enqueueOutboundMessage({
          to:               lead.phone_normalised,
          from:             PRIMARY_SENDER,
          contentSid,
          templateName:     cfg.rule5_template,
          leadId:           lead.id,
          contentVariables: JSON.stringify({ '1': lead.name ?? 'there' }),
        });
        results.push(`rule5:${lead.phone_normalised}`);
      } catch (err) {
        console.error(`[Cron Rule5] Failed for ${lead.phone_normalised}`, err);
      }
    }
  }

  // ── Rule 5b: followup_sent → no reply 72h → track selector → nurture ────
  const RULE5B_DELAY_HOURS = 72;
  const rule5bcutoff = new Date(now - RULE5B_DELAY_HOURS * 60 * 60 * 1000).toISOString();

  const { data: rule5bLeads } = await supabase
    .from('leads')
    .select('id, phone_normalised, name')
    .eq('wa_state', 'followup_sent')
    .eq('wa_opt_in', true)
    .lt('wa_last_outbound_at', rule5bcutoff)
    .is('wa_last_inbound_at', null)
    .limit(50);

  for (const lead of rule5bLeads ?? []) {
    try {
      const contentSid = await getTwilioTemplateSid('wa_track_selector');
      if (!contentSid) {
        console.warn(`[Cron Rule5b] wa_track_selector SID not found — skipping ${lead.phone_normalised}`);
        continue;
      }
      const { error: stateErr } = await supabase
        .from('leads')
        .update({
          wa_state:            'wa_nurture',
          wa_last_outbound_at: new Date().toISOString(),
          wa_last_template:    'wa_track_selector',
        })
        .eq('id', lead.id)
        .eq('wa_state', 'followup_sent');

      if (stateErr) {
        console.warn(`[Cron Rule5b] Optimistic lock failed for ${lead.phone_normalised} — skipping`);
        continue;
      }
      await enqueueOutboundMessage({
        to:               lead.phone_normalised,
        from:             PRIMARY_SENDER,
        contentSid,
        templateName:     'wa_track_selector',
        leadId:           lead.id,
        contentVariables: JSON.stringify({ '1': lead.name ?? 'there' }),
      });
      results.push(`rule5b:${lead.phone_normalised}`);
    } catch (err) {
      console.error(`[Cron Rule5b] Failed for ${lead.phone_normalised}`, err);
    }
  }

  // ── Rule 6a & 6b: post-reply silence ─────────────────────────────────────
  if (!cfg.rule6_enabled) {
    console.log('[Cron Rule6] Disabled — skipping.');
  } else {
    const { data: rule6aLeads } = await supabase
      .from('leads')
      .select('id, phone_normalised, name')
      .eq('wa_state', 'replied')
      .eq('wa_opt_in', true)
      .lt('wa_last_inbound_at', rule6cutoff)
      .or('wa_last_outbound_at.is.null,wa_last_outbound_at.lt.wa_last_inbound_at')
      .is('lead_track', null)
      .limit(50);

    for (const lead of rule6aLeads ?? []) {
      try {
        const contentSid = await getTwilioTemplateSid(cfg.rule6a_template);
        if (!contentSid) {
          console.warn(`[Cron Rule6a] ${cfg.rule6a_template} SID not found — skipping ${lead.phone_normalised}`);
          continue;
        }
        const { error: stateErr } = await supabase
          .from('leads')
          .update({
            wa_state:            'track_selector_sent',
            wa_last_outbound_at: new Date().toISOString(),
            wa_last_template:    cfg.rule6a_template,
          })
          .eq('id', lead.id)
          .eq('wa_state', 'replied'); // Optimistic lock

        if (stateErr) {
          console.warn(`[Cron Rule6a] Optimistic lock failed for ${lead.phone_normalised} — skipping`);
          continue;
        }

        await enqueueOutboundMessage({
          to:               lead.phone_normalised,
          from:             PRIMARY_SENDER,
          contentSid,
          templateName:     cfg.rule6a_template,
          leadId:           lead.id,
          contentVariables: JSON.stringify({ '1': lead.name ?? 'there' }),
        });
        results.push(`rule6a:${lead.phone_normalised}`);
      } catch (err) {
        console.error(`[Cron Rule6a] Failed for ${lead.phone_normalised}`, err);
      }
    }

    const { data: rule6bLeads } = await supabase
      .from('leads')
      .select('id, phone_normalised, name')
      .eq('wa_state', 'replied')
      .eq('wa_opt_in', true)
      .lt('wa_last_inbound_at', rule6cutoff)
      .or('wa_last_outbound_at.is.null,wa_last_outbound_at.lt.wa_last_inbound_at')
      .not('lead_track', 'is', null)
      .limit(50);

    for (const lead of rule6bLeads ?? []) {
      try {
        const contentSid = await getTwilioTemplateSid(cfg.rule6b_template);
        if (!contentSid) {
          console.warn(`[Cron Rule6b] ${cfg.rule6b_template} SID not found — skipping ${lead.phone_normalised}`);
          continue;
        }
        const { error: stateErr } = await supabase
          .from('leads')
          .update({
            wa_last_outbound_at: new Date().toISOString(),
            wa_last_template:    cfg.rule6b_template,
          })
          .eq('id', lead.id)
          .eq('wa_state', 'replied'); // Optimistic lock

        if (stateErr) {
          console.warn(`[Cron Rule6b] Optimistic lock failed for ${lead.phone_normalised} — skipping`);
          continue;
        }

        await enqueueOutboundMessage({
          to:               lead.phone_normalised,
          from:             PRIMARY_SENDER,
          contentSid,
          templateName:     cfg.rule6b_template,
          leadId:           lead.id,
          contentVariables: JSON.stringify({ '1': lead.name ?? 'there' }),
        });
        results.push(`rule6b:${lead.phone_normalised}`);
      } catch (err) {
        console.error(`[Cron Rule6b] Failed for ${lead.phone_normalised}`, err);
      }
    }
  }

  // ── Rule 6c: track_selector_sent → no reply 5d → quietly move to nurture ─
  // No message sent — just unblocks Rules 8-10 which query wa_state=wa_nurture
  // and wa_last_template=wa_track_selector.
  const RULE6C_DELAY_DAYS = 5;
  const rule6ccutoff = new Date(now - RULE6C_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rule6cLeads } = await supabase
    .from('leads')
    .select('id, phone_normalised')
    .eq('wa_state', 'track_selector_sent')
    .eq('wa_opt_in', true)
    .lt('wa_last_outbound_at', rule6ccutoff)
    .or('wa_last_inbound_at.is.null,wa_last_outbound_at.gt.wa_last_inbound_at')
    .limit(50);

  for (const lead of rule6cLeads ?? []) {
    await supabase
      .from('leads')
      .update({ wa_state: 'wa_nurture' })
      .eq('id', lead.id)
      .eq('wa_state', 'track_selector_sent');
    results.push(`rule6c:${lead.phone_normalised}`);
  }

  // ── Rule 7: nurture re-engagement (7 days after going cold) ─────────────
  const RULE7_DELAY_HOURS = 168; // 7 days
  const RULE7_TEMPLATE    = 'wa_track_selector';
  const rule7cutoff = new Date(now - RULE7_DELAY_HOURS * 60 * 60 * 1000).toISOString();

  const { data: rule7Leads } = await supabase
    .from('leads')
    .select('id, phone_normalised, name')
    .eq('wa_state', 'wa_nurture')
    .eq('wa_opt_in', true)
    .lt('wa_last_inbound_at', rule7cutoff)
    .or('wa_last_outbound_at.is.null,wa_last_outbound_at.lt.wa_last_inbound_at')
    .limit(50);

  for (const lead of rule7Leads ?? []) {
    try {
      const contentSid = await getTwilioTemplateSid(RULE7_TEMPLATE);
      if (!contentSid) {
        console.warn(`[Cron Rule7] ${RULE7_TEMPLATE} SID not found — skipping ${lead.phone_normalised}`);
        continue;
      }

      await supabase
        .from('leads')
        .update({
          wa_last_outbound_at: new Date().toISOString(),
          wa_last_template:    RULE7_TEMPLATE,
        })
        .eq('id', lead.id);

      await enqueueOutboundMessage({
        to:               lead.phone_normalised,
        from:             PRIMARY_SENDER,
        contentSid,
        templateName:     RULE7_TEMPLATE,
        leadId:           lead.id,
        contentVariables: JSON.stringify({ '1': lead.name ?? 'there' }),
      });
      results.push(`rule7:${lead.phone_normalised}`);
    } catch (err) {
      console.error(`[Cron Rule7] Failed for ${lead.phone_normalised}`, err);
    }
  }

  // ── Rules 8-10: nurture drip sequence ────────────────────────────────────
  // Each rule fires only after the previous one has been sent (checked via
  // wa_last_template) and enough time has passed (wa_last_outbound_at cutoff).
  // getTwilioTemplateSid returns null for pending templates → skips silently
  // until Meta approves them.
  const NURTURE_STEPS = [
    { rule: 'rule8',  prevTemplate: 'wa_track_selector', template: 'wa_nurture_1', delayDays: 3  },
    { rule: 'rule9',  prevTemplate: 'wa_nurture_1',      template: 'wa_nurture_2', delayDays: 4  },
    { rule: 'rule10', prevTemplate: 'wa_nurture_2',      template: 'wa_nurture_3', delayDays: 7  },
  ];

  for (const step of NURTURE_STEPS) {
    const cutoff = new Date(now - step.delayDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: stepLeads } = await supabase
      .from('leads')
      .select('id, phone_normalised, name')
      .eq('wa_state', 'wa_nurture')
      .eq('wa_opt_in', true)
      .eq('wa_last_template', step.prevTemplate)
      .lt('wa_last_outbound_at', cutoff)
      .or('wa_last_inbound_at.is.null,wa_last_outbound_at.gt.wa_last_inbound_at')
      .limit(50);

    for (const lead of stepLeads ?? []) {
      try {
        const contentSid = await getTwilioTemplateSid(step.template);
        if (!contentSid) {
          console.warn(`[Cron ${step.rule}] ${step.template} not approved yet — skipping ${lead.phone_normalised}`);
          continue;
        }

        await supabase
          .from('leads')
          .update({
            wa_last_outbound_at: new Date().toISOString(),
            wa_last_template:    step.template,
          })
          .eq('id', lead.id);

        await enqueueOutboundMessage({
          to:               lead.phone_normalised,
          from:             PRIMARY_SENDER,
          contentSid,
          templateName:     step.template,
          leadId:           lead.id,
          contentVariables: JSON.stringify({ '1': lead.name ?? 'there' }),
        });
        results.push(`${step.rule}:${lead.phone_normalised}`);
      } catch (err) {
        console.error(`[Cron ${step.rule}] Failed for ${lead.phone_normalised}`, err);
      }
    }
  }

  console.log(`[Cron] Follow-up sweep complete: ${results.length} messages queued.`);
  return NextResponse.json({ success: true, count: results.length, details: results });
}
