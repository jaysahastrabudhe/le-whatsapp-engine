import { NextResponse } from 'next/server';
import { classifyReply } from '@/lib/engine/classifier';
import { supabase } from '@/lib/supabase';

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function POST(request: Request) {
  const { rows } = await request.json() as {
    rows: { phone: string; replyText: string; repliedAt?: string }[];
  };

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
  }

  const previews = await Promise.all(
    rows.map(async (row) => {
      const phone = normalisePhone(row.phone);

      // Find lead
      const { data: lead } = await supabase
        .from('leads')
        .select('id, name, wa_state, wa_reply_class')
        .eq('phone_normalised', phone)
        .single();

      // Auto-classify
      const classified = await classifyReply(row.replyText || '');

      // Derive wa_state from classification
      let waState = 'replied';
      if (classified.optOut) {
        waState = 'wa_closed';
      } else if (classified.replyClass === 'interested' || classified.replyClass === 'fee_question') {
        waState = 'wa_hot';
      } else if (classified.replyClass === 'not_now') {
        waState = 'wa_nurture';
      } else if (classified.replyClass === 'wrong_number' || classified.replyClass === 'stop') {
        waState = 'wa_closed';
      }

      return {
        phone,
        replyText: row.replyText,
        repliedAt: row.repliedAt || null,
        leadId: lead?.id || null,
        leadName: lead?.name || null,
        currentState: lead?.wa_state || null,
        currentClass: lead?.wa_reply_class || null,
        autoClass: classified.replyClass,
        autoHotness: classified.hotness,
        autoState: waState,
        matched: !!lead,
      };
    })
  );

  return NextResponse.json({ previews });
}
