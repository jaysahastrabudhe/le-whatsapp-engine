import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';

// Receives stage/status updates from a Zoho workflow rule that fires whenever
// Lead_Stage or Lead_Status is modified. Keeps Supabase in sync without
// relying on the daily MQL pull (which only ever sees current MQL leads).
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const contentType = req.headers.get('content-type') || '';

    // 1. HMAC validation (matches /api/webhooks/zoho)
    const signature = req.headers.get('x-zoho-signature');
    if (signature && config.ZOHO_WEBHOOK_SECRET) {
      const generatedSignature = crypto
        .createHmac('sha256', config.ZOHO_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
      if (signature !== generatedSignature) {
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }
    }

    // 2. Parse payload — Zoho can send via URL params, JSON, or form-encoded body
    let payload: Record<string, any> = {};
    const urlParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    if (Object.keys(urlParams).length > 0) payload = { ...payload, ...urlParams };
    if (rawBody && rawBody.trim().length > 0) {
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(rawBody);
        payload = { ...payload, ...Object.fromEntries(params.entries()) };
      } else {
        try { payload = { ...payload, ...JSON.parse(rawBody) }; } catch { /* ignore */ }
      }
    }

    // Log the exact payload Zoho sends so we can debug field mappings
    console.log('[Zoho Stage Webhook] Raw payload:', JSON.stringify(payload));

    const zohoId = payload.zoho_lead_id || payload.id || payload.Id || payload.ID;
    if (!zohoId) {
      console.warn('[Zoho Stage Webhook] Missing zoho_lead_id in payload');
      return NextResponse.json({ error: 'Missing zoho_lead_id', received: payload }, { status: 400 });
    }

    // Lead_Stage / Lead_Status — accept both API-name and display-name variants
    const leadStage  = payload.Lead_Stage  ?? payload['Lead Stage']  ?? null;
    const leadStatus = payload.Lead_Status ?? payload['Lead Status'] ?? null;

    // Empty strings from Zoho mean the field was cleared — store as null
    const normStage  = leadStage  === '' ? null : leadStage;
    const normStatus = leadStatus === '' ? null : leadStatus;

    const { data: existing, error: fetchErr } = await supabase
      .from('leads')
      .select('id, lead_stage, lead_status, wa_state')
      .eq('zoho_lead_id', zohoId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[Zoho Stage Webhook] Fetch error:', fetchErr.message);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!existing) {
      // Lead not in our system yet — nothing to update. The main /webhooks/zoho
      // route handles new lead creation.
      return NextResponse.json({ success: true, skipped: 'lead_not_found', zohoId });
    }

    if (existing.lead_stage === normStage && existing.lead_status === normStatus) {
      return NextResponse.json({ success: true, skipped: 'no_change', zohoId });
    }

    // Detect demotion out of MQL (e.g. MQL → Leads)
    const CALL_QUEUE_STATES = ['call_queued', 'call_follow_up', 'discovery_call'];
    const isMqlDemotion = existing.lead_stage === 'MQL' && normStage !== null && normStage !== 'MQL';

    const updatePayload: Record<string, any> = {
      lead_stage:  normStage,
      lead_status: normStatus,
      updated_at:  new Date().toISOString(),
    };

    // When demoted out of MQL, evict from the call queue and cancel any scheduled follow-up
    if (isMqlDemotion) {
      if (CALL_QUEUE_STATES.includes(existing.wa_state ?? '')) {
        updatePayload.wa_state = 'wa_idle';
      }
      updatePayload.followup_call_at = null;
    }

    const { error: updateErr } = await supabase
      .from('leads')
      .update(updatePayload)
      .eq('id', existing.id);

    if (updateErr) {
      console.error('[Zoho Stage Webhook] Update error:', updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(
      `[Zoho Stage Webhook] ${zohoId}: ${existing.lead_stage}/${existing.lead_status} → ${normStage}/${normStatus}` +
      (isMqlDemotion ? ' [MQL demotion — evicted from call queue]' : '')
    );
    return NextResponse.json({
      success: true,
      zohoId,
      from: { stage: existing.lead_stage,  status: existing.lead_status },
      to:   { stage: normStage,            status: normStatus },
      ...(isMqlDemotion && { mqlDemotion: true, queueEvicted: updatePayload.wa_state === 'wa_idle' }),
    });
  } catch (e: any) {
    console.error('[Zoho Stage Webhook] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
