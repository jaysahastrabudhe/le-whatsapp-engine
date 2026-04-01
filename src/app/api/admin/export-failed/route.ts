import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getApprovedTemplates } from '@/lib/twilio/templates';

const ERROR_LABELS: Record<string, string> = {
  '63049': 'Meta: marketing category rejected',
  '63032': 'User opted out (STOP)',
  '21211': 'Invalid / non-WhatsApp number',
  '63016': 'Template not approved',
  '63033': 'WhatsApp not enabled on number',
  '30008': 'Unknown carrier error',
  '63003': 'Channel configuration error',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '0');

  // Build query
  let query = supabase
    .from('messages')
    .select('id, lead_id, phone_normalised, template_id, template_variant_id, error_code, sent_at, leads!lead_id(name)')
    .eq('direction', 'outbound')
    .eq('status', 'failed')
    .order('sent_at', { ascending: false })
    .limit(500);

  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('sent_at', cutoff);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build template SID → body lookup
  const templates = await getApprovedTemplates().catch(() => []);
  const sidToTemplate: Record<string, { name: string; body: string | null }> = {};
  for (const t of templates) {
    sidToTemplate[t.sid] = { name: t.name, body: t.body };
  }

  // Build CSV
  const header = ['Name', 'Phone', 'WhatsApp Link', 'Template Name', 'Template Body', 'Error Code', 'Error Description', 'Failed At', 'Lead ID'];
  const csvRows = [header.join(',')];

  for (const row of rows || []) {
    const leadData = row.leads as any;
    const name = leadData?.name || '';
    const phone = row.phone_normalised || '';
    const barePhone = phone.replace('+', '');
    const waLink = barePhone ? `https://wa.me/${barePhone}` : '';
    const tpl = sidToTemplate[row.template_variant_id || ''];
    const templateName = row.template_id || tpl?.name || '';
    const templateBody = (tpl?.body || '').replace(/"/g, '""'); // escape quotes
    const errorCode = row.error_code || '';
    const errorDesc = ERROR_LABELS[errorCode] || 'Unknown';
    const failedAt = row.sent_at
      ? new Date(row.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : '';
    const leadId = row.lead_id || '';

    csvRows.push([
      `"${name}"`,
      phone,
      waLink,
      templateName,
      `"${templateBody}"`,
      errorCode,
      `"${errorDesc}"`,
      `"${failedAt}"`,
      leadId,
    ].join(','));
  }

  const csv = csvRows.join('\n');
  const dateStr = new Date().toISOString().slice(0, 10);

  // Log the export
  await supabase.from('csv_imports').insert({
    type: 'failed_export',
    filename: `failed_messages_${dateStr}.csv`,
    row_count: (rows || []).length,
    success_count: (rows || []).length,
    fail_count: 0,
    imported_by: 'admin',
  }).then(({ error: logErr }) => {
    if (logErr) console.warn('[Export] Failed to log export:', logErr.message);
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="failed_messages_${dateStr}.csv"`,
    },
  });
}
