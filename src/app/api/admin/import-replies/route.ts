import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type ConfirmedRow = {
  phone: string;
  replyText: string;
  repliedAt: string | null;
  leadId: string | null;
  replyClass: string;
  hotness: string;
  waState: string;
};

function deriveHotness(replyClass: string): string {
  switch (replyClass) {
    case 'interested': return 'hot';
    case 'fee_question': return 'warm';
    case 'not_now': return 'cold';
    case 'wrong_number': case 'stop': return 'dead';
    default: return 'warm';
  }
}

function deriveState(replyClass: string): string {
  switch (replyClass) {
    case 'interested': case 'fee_question': return 'wa_hot';
    case 'not_now': return 'wa_nurture';
    case 'wrong_number': case 'stop': return 'wa_closed';
    default: return 'replied';
  }
}

export async function POST(request: Request) {
  const { rows, filename } = await request.json() as {
    rows: ConfirmedRow[];
    filename?: string;
  };

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
  }

  const results: { phone: string; status: 'ok' | 'skipped' | 'error'; reason?: string }[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const row of rows) {
    try {
      if (!row.leadId) {
        results.push({ phone: row.phone, status: 'error', reason: 'Lead not found in Supabase' });
        failCount++;
        continue;
      }

      const now = row.repliedAt || new Date().toISOString();
      const hotness = deriveHotness(row.replyClass);
      const waState = deriveState(row.replyClass);
      const waOptIn = row.replyClass !== 'stop';

      // Deduplication check: skip if same phone + content + timestamp already exists
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('phone_normalised', row.phone)
        .eq('direction', 'inbound')
        .eq('content', row.replyText)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({ phone: row.phone, status: 'skipped', reason: 'Duplicate: same phone + reply text already exists' });
        continue;
      }

      // Update lead
      const { error: leadErr } = await supabase
        .from('leads')
        .update({
          wa_reply_class:     row.replyClass,
          wa_hotness:         hotness,
          wa_state:           waState,
          wa_last_inbound_at: now,
          wa_opt_in:          waOptIn,
          zoho_synced_at:     null,    // dirty flag for Zoho reconcile
          updated_at:         new Date().toISOString(),
        })
        .eq('id', row.leadId);

      if (leadErr) {
        results.push({ phone: row.phone, status: 'error', reason: `Lead update failed: ${leadErr.message}` });
        failCount++;
        continue;
      }

      // Insert message
      await supabase.from('messages').insert({
        lead_id:          row.leadId,
        phone_normalised: row.phone,
        direction:        'inbound',
        content:          row.replyText,
        status:           'received',
        sender_number:    row.phone,
        sent_at:          now,
      });

      // Log event
      await supabase.from('lead_events').insert({
        lead_id:    row.leadId,
        event_type: 'csv_import',
        payload:    {
          source: 'manual_wa_reply',
          reply_text: row.replyText,
          classification: row.replyClass,
          hotness,
          wa_state: waState,
        },
      }).then(({ error }) => {
        if (error) console.warn('[Import] lead_events insert failed:', error.message);
      });

      results.push({ phone: row.phone, status: 'ok' });
      successCount++;
    } catch (err: any) {
      results.push({ phone: row.phone, status: 'error', reason: err.message });
      failCount++;
    }
  }

  // Audit log
  await supabase.from('csv_imports').insert({
    type:          'reply_import',
    filename:      filename || 'upload.csv',
    row_count:     rows.length,
    success_count: successCount,
    fail_count:    failCount,
    imported_by:   'admin',
    details:       results,
  }).then(({ error }) => {
    if (error) console.warn('[Import] csv_imports log failed:', error.message);
  });

  return NextResponse.json({
    success: true,
    total: rows.length,
    imported: successCount,
    failed: failCount,
    skipped: rows.length - successCount - failCount,
    results,
  });
}
