import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { evaluateLeadAction } from '@/lib/engine/rulesEngine';

// Define expected Zoho payload schema loosely for now
const zohoPayloadSchema = z.object({
  id: z.string().optional(),
  zoho_lead_id: z.string(),
  phone: z.string(),
  name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  lead_source: z.string().optional().nullable(),
  campaign_name: z.string().optional().nullable(),
  owner_email: z.string().email().optional().nullable(),
  event_type: z.string().optional(),
  // Fields from Zoho (matching both internal and Display-as-API names)
  program: z.string().optional().nullable(),
  Program: z.string().optional().nullable(),
  persona: z.string().optional().nullable(),
  You_are_interested_as: z.string().optional().nullable(),
  academic_level: z.string().optional().nullable(),
  What_options_are_you_exploring: z.string().optional().nullable(),
  What_are_you_currently_doing: z.string().optional().nullable(),
  relocate_to_pune: z.string().optional().nullable(),
  If_selected_would_you_be_comfortable_relocating: z.string().optional().nullable(),
  Are_you_ready_to_come_to_Pune_and_make_the_next_3: z.string().optional().nullable(),
});

/** Derive urgency from academic_level per Rule 3 */
function computeUrgency(intake: string | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!intake) return 'HIGH'; // unknown → don't suppress
  const val = intake.toLowerCase();
  // "2027 Intake" or later → lower priority but still worth contacting
  if (val.includes('2027')) return 'MEDIUM';
  // "2028 Intake" or beyond → not ready yet
  if (val.match(/202[89]|20[3-9]\d/)) return 'LOW';
  // "2026 Intake" or anything else → HIGH
  return 'HIGH';
}

export async function POST(req: NextRequest) {
  try {
    // 0. Global Kill Switch Check
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'engine_enabled')
      .single();
    
    const isEnabled = settings?.value?.value ?? true;
    if (!isEnabled) {
      console.log('[Zoho Webhook] ENGINE IS DISABLED via Admin. Skipping processing.');
      return NextResponse.json({ success: true, message: 'Engine paused' });
    }

    const rawBody = await req.text();
    const contentType = req.headers.get('content-type') || '';
    
    console.log(`[Zoho Webhook] Raw Body:`, rawBody);

    // 1. HMAC Validation (Security)
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

    // 2. Parse payload (Handle URL Params, JSON, Form Data)
    let payload: any = {};
    
    // Source A: URL Search Params
    const urlParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    if (Object.keys(urlParams).length > 0) {
      console.log(`[Zoho Webhook] Source: URL Params`, JSON.stringify(urlParams, null, 2));
      payload = { ...payload, ...urlParams };
    }

    // Source B: Body (JSON or Form-URL-Encoded)
    if (rawBody && rawBody.trim().length > 0) {
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(rawBody);
        const bodyForm = Object.fromEntries(params.entries());
        console.log(`[Zoho Webhook] Source: Form Body`, JSON.stringify(bodyForm, null, 2));
        payload = { ...payload, ...bodyForm };
      } else {
        try {
          const bodyJson = JSON.parse(rawBody);
          console.log(`[Zoho Webhook] Source: JSON Body`, JSON.stringify(bodyJson, null, 2));
          payload = { ...payload, ...bodyJson };
        } catch (e) {
          console.warn(`[Zoho Webhook] Body not JSON.`, rawBody);
        }
      }
    }
    
    // Source C: If everything is still empty, try parsing as formData directly (for multipart)
    if (Object.keys(payload).length === 0 && contentType.includes('multipart/form-data')) {
      try {
        const formData = await req.formData();
        payload = Object.fromEntries(formData.entries());
        console.log(`[Zoho Webhook] Source: Multi-part Form`, JSON.stringify(payload, null, 2));
      } catch (e) {
        console.warn(`[Zoho Webhook] Could not parse formData.`);
      }
    }

    // 3. Validate Payload structure
    const validation = zohoPayloadSchema.safeParse(payload);
    if (!validation.success) {
      console.error(`[Zoho Webhook] Zod Validation Failed:`, JSON.stringify(validation.error.format(), null, 2));
      // For now, continue if we have at least phone and id, even if Zod complains about others
      if (!payload.phone && !payload.zoho_lead_id) {
        return NextResponse.json({ error: 'Invalid payload structure', details: validation.error }, { status: 400 });
      }
    }

    const data = payload; // Use raw payload if we pass the minimum check

    // ── SMART MAPPING ──────────────────────────────────────────────────────
    // Zoho parameter names from user's latest manual update
    const zohoId = data.zoho_lead_id || data.id || data['Lead Id'] || data['Record Id'];
    
    // Prioritise mobile/Mobile then phone/Phone
    const rawPhone = data.mobile || data.Mobile || data.phone || data.Phone || data['Phone Number'] || undefined;

    if (!zohoId) {
      console.error(`[Zoho Webhook] MISSING ID. Found ID: ${zohoId}. Keys available:`, Object.keys(data));
      return NextResponse.json({ 
        error: 'Missing zoho_lead_id', 
        received_keys: Object.keys(data),
        tip: 'Please ensure "zoho_lead_id": "${Leads.Lead Id}" is in your JSON body.'
      }, { status: 400 });
    }

    if (rawPhone === undefined || rawPhone === null || String(rawPhone).trim() === '') {
      console.log(`[Zoho Webhook] Skipping lead ${zohoId}: No phone number provided. Payload:`, JSON.stringify(data));
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook received, but lead has no phone number. Skipping processing.' 
      }, { status: 200 });
    }

    // Normalise Phone
    const phoneNum = String(rawPhone).replace(/\D/g, '');
    const cleanPhone = phoneNum.startsWith('91') ? `+${phoneNum}` : (phoneNum.length === 10 ? `+91${phoneNum}` : `+${phoneNum}`);

    // Compute urgency from intake year field (Rule 3)
    // Zoho field: "When are you looking to start your business degree"
    // Returns: "2026 Intake", "2027 Intake", or null
    const academicLevel =
      data.When_are_you_looking_to_start_your_business_degre ||
      data['When are you looking to start your business degre'] ||
      data.academic_level ||
      data.What_options_are_you_exploring ||
      data.What_are_you_currently_doing ||
      null;
    const urgency = computeUrgency(academicLevel);

    // Contact fields — safe to overwrite on every webhook (CRM data, not WA state)
    const firstName = data.first_name || data['First Name'] || '';
    const lastName = data.last_name || data['Last Name'] || '';
    const fullName = data.name || data['Full Name'] || `${firstName} ${lastName}`.trim() || 'Lead';

    const contactFields = {
      zoho_lead_id: zohoId,
      phone_normalised: cleanPhone,
      name: fullName,
      email: data.email || null,
      lead_source: data.lead_source || data['Lead Source'] || data['Lead_Source'] || null,
      campaign_name: data.campaign_name || data['Ad Campaign Name'] || data['Ad_Campaign_Name'] || null,
      owner_email: data.owner_email || data['Owner'] || null,
      program: data.program || data.Program || null,
      persona: data.persona || data.You_are_interested_as1 || data.You_are_interested_as || data['You_are_interested_as'] || null,
      academic_level: academicLevel,
      relocate_to_pune: data.relocate_to_pune || data.If_selected_would_you_be_comfortable_relocating || data.Are_you_ready_to_come_to_Pune_and_make_the_next_3 || null,
      urgency,
      lead_stage:  data.Lead_Stage  || data['Lead Stage']  || null,
      lead_status: data.Lead_Status || data['Lead Status'] || null,
    };

    // Check if lead already exists (by phone)
    const { data: existing } = await supabase
      .from('leads')
      .select('id, wa_state, wa_opt_in, wa_last_outbound_at')
      .eq('phone_normalised', cleanPhone)
      .maybeSingle();

    let lead;
    if (existing) {
      // Existing lead: update only contact fields — never touch wa_* columns
      const { data: updated, error: updateError } = await supabase
        .from('leads')
        .update(contactFields)
        .eq('phone_normalised', cleanPhone)
        .select()
        .single();

      if (updateError || !updated) {
        console.error(`[Webhook] DB Error updating lead ${data.zoho_lead_id}:`, updateError);
        return NextResponse.json({ error: 'DB Error' }, { status: 500 });
      }
      lead = updated;
      console.log(`[Webhook] Updated existing lead ${lead.zoho_lead_id} (wa_state preserved: ${existing.wa_state})`);
    } else {
      // New lead: insert with initial WA state
      const { data: inserted, error: insertError } = await supabase
        .from('leads')
        .insert({ ...contactFields, wa_state: 'wa_pending', wa_opt_in: true })
        .select()
        .single();

      if (insertError || !inserted) {
        console.error(`[Webhook] DB Error inserting lead ${data.zoho_lead_id}:`, insertError);
        return NextResponse.json({ error: 'DB Error' }, { status: 500 });
      }
      lead = inserted;
      console.log(`[Webhook] Inserted new lead ${lead.zoho_lead_id}`);
    }

    // Evaluate routing through the Logic Builder rules graph
    console.log(`[Webhook] Evaluating lead ${lead.zoho_lead_id} via Logic Builder...`);
    await evaluateLeadAction(lead);

    return NextResponse.json({ success: true, received: true, evaluated: true }, { status: 200 });

  } catch (error: any) {
    console.error(`[Webhook error] Zoho:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
