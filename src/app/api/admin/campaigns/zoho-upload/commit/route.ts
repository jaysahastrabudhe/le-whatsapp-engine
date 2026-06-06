import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enqueueCampaignMessage } from '@/lib/queue/client';

const PRIMARY_SENDER = '+917709333161';

export async function POST(request: Request) {
  try {
    const { rows, templateSid, templateName, campaignName, summary, zohoModule } = await request.json();

    if (!rows || rows.length === 0 || !campaignName || !templateSid || !templateName) {
      return NextResponse.json({ error: 'Missing required fields or rows' }, { status: 400 });
    }

    const matchedRows = rows.filter((r: any) => r.status === 'matched' && r.lead_id);
    const stagedRows  = rows.filter((r: any) => r.status === 'staged' && r.phone);

    if (matchedRows.length === 0 && stagedRows.length === 0) {
      return NextResponse.json({ error: 'No sendable recipients.' }, { status: 400 });
    }

    // 1. Upsert staged contacts into campaign_contacts
    const contactIdMap = new Map<string, string>(); // phone → contact uuid
    if (stagedRows.length > 0) {
      const contactsToUpsert = stagedRows.map((r: any) => ({
        zoho_id:          r.zoho_lead_id,
        zoho_module:      zohoModule || 'contacts',
        name:             r.name || null,
        phone_normalised: r.phone,
        status:           'staging',
      }));

      const { data: upserted, error: uErr } = await supabase
        .from('campaign_contacts')
        .upsert(contactsToUpsert, { onConflict: 'zoho_id,zoho_module' })
        .select('id, phone_normalised');

      if (uErr) throw new Error(`Failed to stage contacts: ${uErr.message}`);

      for (const c of upserted ?? []) {
        contactIdMap.set(c.phone_normalised, c.id);
      }
    }

    // 2. Create zoho_upload_batch
    const { data: batch, error: bErr } = await supabase
      .from('zoho_upload_batches')
      .insert({
        filename:  'campaign_upload.csv',
        row_count: summary?.total || rows.length,
        matched:   matchedRows.length + stagedRows.length,
        skipped:   summary?.skipped || 0,
      })
      .select()
      .single();

    if (bErr || !batch) {
      throw new Error(`Failed to create batch: ${bErr?.message}`);
    }

    // 3. Create campaign
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .insert({
        name:               campaignName,
        template_variant_id: templateSid,
        segment_filters:    { campaign_source: 'zoho_upload', zoho_upload_id: batch.id },
        status:             'running',
        source:             'zoho_upload',
        zoho_upload_id:     batch.id,
      })
      .select()
      .single();

    if (cErr || !campaign) {
      throw new Error(`Failed to create campaign: ${cErr?.message}`);
    }

    await supabase.from('zoho_upload_batches').update({ campaign_id: campaign.id }).eq('id', batch.id);

    // 4. Insert campaign_leads for matched rows (lead_id) and staged rows (contact_id)
    const campaignLeadsToInsert: any[] = [
      ...matchedRows.map((r: any) => ({
        campaign_id: campaign.id,
        lead_id:     r.lead_id,
        status:      'pending',
      })),
      ...stagedRows.map((r: any) => ({
        campaign_id: campaign.id,
        contact_id:  contactIdMap.get(r.phone) ?? null,
        status:      'pending',
      })).filter((r: any) => r.contact_id !== null),
    ];

    await supabase.from('campaign_leads').insert(campaignLeadsToInsert);

    // 5. Enqueue messages — parallelize in chunks to avoid Vercel function timeouts.
    // Each enqueue is a Redis HTTP roundtrip (~100ms); sequential takes ~20s for
    // 190 items and silently truncates on Vercel's 60s limit (this was the cause
    // of the May 6 campaign sitting at 0/190 — only campaign_leads got inserted,
    // the enqueue loop never finished).
    const ENQUEUE_CHUNK = 25;
    let enqueued = 0;

    const matchedPayloads = matchedRows.map((r: any) => ({
      to:               r.phone,
      from:             PRIMARY_SENDER,
      contentSid:       templateSid,
      templateName,
      leadId:           r.lead_id,
      campaignId:       campaign.id,
      contentVariables: JSON.stringify({ '1': r.name || 'there' }),
    }));

    const stagedPayloads = stagedRows
      .map((r: any) => {
        const contactId = contactIdMap.get(r.phone);
        if (!contactId) return null;
        return {
          to:               r.phone,
          from:             PRIMARY_SENDER,
          contentSid:       templateSid,
          templateName,
          contactId,
          campaignId:       campaign.id,
          contentVariables: JSON.stringify({ '1': r.name || 'there' }),
        };
      })
      .filter((p: any): p is NonNullable<typeof p> => p !== null);

    const allPayloads = [...matchedPayloads, ...stagedPayloads];
    for (let i = 0; i < allPayloads.length; i += ENQUEUE_CHUNK) {
      const chunk = allPayloads.slice(i, i + ENQUEUE_CHUNK);
      const results = await Promise.allSettled(
        chunk.map((p) => enqueueCampaignMessage(p)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') enqueued++;
        else console.error('[Zoho Upload] Enqueue failed:', r.reason);
      }
    }

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      enqueued,
    });

  } catch (error: any) {
    console.error('[API] Commit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
