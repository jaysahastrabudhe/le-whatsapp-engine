// src/app/api/cron/process-queue/route.ts
import { NextResponse } from 'next/server';
import { dequeueInbound, dequeueOutbound, dequeueStatus, dequeueDelayedOutbound, dequeueCampaignMessages } from '@/lib/queue/client';
import { processInboundMessage } from '@/lib/workers/inboundProcessor';
import { processStatusUpdate } from '@/lib/workers/statusProcessor';
import { dispatchMessage } from '@/lib/engine/dispatcher';
import { isWithinSendWindow } from '@/lib/engine/sessionWindow';
import { evaluateLeadAction } from '@/lib/engine/rulesEngine';
import { supabase } from '@/lib/supabase';

// cron-job.org calls this every minute.
// Drains inbound, outbound, status, and sweeps delayed outbound.

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('[Cron] Queue drain starting...');
  const results: string[] = [];

  try {
    // 1. Process inbound messages (classify replies, update Supabase)
    const inboundJobs = await dequeueInbound(10);
    for (const data of inboundJobs) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await processInboundMessage({ data } as any);
        results.push(`inbound:${data.From}`);
      } catch (e) {
        console.error('[Cron] Inbound job error', e);
      }
    }

    // 2. Dispatch outbound messages via Twilio
    // First, if window is open, sweep some from delayed into active or process directly
    if (isWithinSendWindow()) {
      const delayedJobs = await dequeueDelayedOutbound(5);
      for (const data of delayedJobs) {
        try {
          const msg = await dispatchMessage({
            ...data,
            to:         data.to as string,
            from:       data.from as string,
            contentSid: data.contentSid as string,
            contentVariables: data.contentVariables ? JSON.parse(data.contentVariables as string) : undefined
          } as any);
          if (msg) {
            results.push(`outbound_delayed:${data.to}:${msg.sid}`);
            console.log(`[Cron] Sent delayed ${data.contentSid} to ${data.to} — SID: ${msg.sid}`);
          }
        } catch (e) {
          console.error(`[Cron] Delayed outbound dispatch error for ${data.to}`, e);
        }
      }
    }

    // Process regular outbound queue
    const outboundJobs = await dequeueOutbound(10);
    for (const data of outboundJobs) {
      try {
        const msg = await dispatchMessage({
          ...data,
          to:         data.to as string,
          from:       data.from as string,
          contentSid: data.contentSid as string,
          contentVariables: data.contentVariables ? JSON.parse(data.contentVariables as string) : undefined,
          // Redis payload is string-typed — coerce. Set on transactional first-touch
          // receipts (form-fill confirmation) which must not be cooldown-suppressed.
          bypassCooldown: data.bypassCooldown === 'true',
        } as any);
        if (msg) {
          results.push(`outbound:${data.to}:${msg.sid}`);
          console.log(`[Cron] Sent ${data.contentSid} to ${data.to} — SID: ${msg.sid}`);
        }
      } catch (e) {
        console.error(`[Cron] Outbound dispatch error for ${data.to}`, e);
      }
    }

    // 3. Drain campaign queue — random batch size + jitter to avoid bulk patterns
    if (isWithinSendWindow()) {
      const batchSize = Math.floor(Math.random() * 7) + 8; // 8–14 per tick
      const campaignJobs = await dequeueCampaignMessages(batchSize);
      // Shuffle to avoid sequential phone number patterns
      campaignJobs.sort(() => Math.random() - 0.5);

      for (const data of campaignJobs) {
        // Random jitter 200–600ms between each dispatch
        await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
        try {
          const msg = await dispatchMessage({
            ...data,
            to:               data.to as string,
            from:             data.from as string,
            contentSid:       data.contentSid as string,
            contentVariables: data.contentVariables ? JSON.parse(data.contentVariables as string) : undefined,
            bypassCooldown:   true, // Campaigns are explicit broadcasts — opt out of the 2-msg cooldown
          } as any);
          if (msg) {
            results.push(`campaign:${data.to}:${msg.sid}`);
            console.log(`[Cron] Campaign sent ${data.contentSid} to ${data.to} — SID: ${msg.sid}`);
            if (data.campaignId) {
              // Update campaign_leads by lead_id (matched) or contact_id (staged)
              const clUpdate = supabase
                .from('campaign_leads')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('campaign_id', data.campaignId);

              if (data.leadId) {
                await clUpdate.eq('lead_id', data.leadId);
              } else if (data.contactId) {
                await clUpdate.eq('contact_id', data.contactId);
              }

              // Mark campaign completed when no pending rows remain
              const { count: pendingCount } = await supabase
                .from('campaign_leads')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', data.campaignId)
                .eq('status', 'pending');
              if (pendingCount === 0) {
                await supabase
                  .from('campaigns')
                  .update({ status: 'completed' })
                  .eq('id', data.campaignId)
                  .eq('status', 'running');
              }
            }
          }
        } catch (e) {
          console.error(`[Cron] Campaign dispatch error for ${data.to}`, e);
        }
      }
    }

    // 4. Process status updates (delivery/read/failed callbacks)
    const statusJobs = await dequeueStatus(10);
    for (const data of statusJobs) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await processStatusUpdate({ data } as any);
        results.push(`status:${data.MessageSid}`);
      } catch (e) {
        console.error('[Cron] Status job error', e);
      }
    }

    // 5. Sweep wa_pending leads that arrived outside the send window
    // Only runs when the window is open — picks up overnight leads at 9am
    if (isWithinSendWindow()) {
      const { data: pendingLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('wa_state', 'wa_pending')
        .eq('wa_opt_in', true)
        .is('wa_last_outbound_at', null)
        .limit(50);

      for (const lead of pendingLeads || []) {
        try {
          await evaluateLeadAction(lead);
          results.push(`pending_sweep:${lead.id}`);
        } catch (e) {
          console.error(`[Cron] Pending sweep error for lead ${lead.id}`, e);
        }
      }

      if ((pendingLeads || []).length > 0) {
        console.log(`[Cron] Pending sweep: evaluated ${pendingLeads!.length} wa_pending leads`);
      }
    }
  } catch (err) {
    console.error('[Cron] Fatal error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ success: true, processed: results.length, details: results });
}
