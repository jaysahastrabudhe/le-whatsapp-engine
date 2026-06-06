import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { syncTemplatesToSupabase } from '@/lib/twilio/templates';

export async function POST(request: Request) {
  try {
    const { name, body, category, buttons, language, mediaUrl } = await request.json();

    if (!name || !body || !category) {
      return NextResponse.json({ error: 'name, body and category are required' }, { status: 400 });
    }

    // Validate media URL if provided — Twilio must be able to fetch it over https
    if (mediaUrl) {
      let parsed: URL | null = null;
      try { parsed = new URL(mediaUrl); } catch { /* invalid */ }
      if (!parsed || !/^https?:$/.test(parsed.protocol)) {
        return NextResponse.json({ error: 'mediaUrl must be a valid http(s) URL' }, { status: 400 });
      }
    }

    const credentials = Buffer.from(
      `${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`
    ).toString('base64');
    const headers = {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };

    // Extract variables from body — {{1}}, {{2}}, etc.
    const varMatches = body.match(/\{\{(\d+)\}\}/g) ?? [];
    const varNumbers = [...new Set(varMatches.map((m: string) => m.replace(/[{}]/g, '')))];
    const variables: Record<string, string> = {};
    varNumbers.forEach((n: string) => { variables[n] = `variable_${n}`; });

    // Build Twilio Content API payload.
    // Precedence: media header > quick-reply buttons > plain text. WhatsApp does not
    // allow a media header and quick-reply buttons in the same simple template, so the
    // UI keeps them mutually exclusive.
    let contentType: Record<string, any>;
    if (mediaUrl) {
      contentType = {
        'twilio/media': { body, media: [mediaUrl] },
      };
    } else if (buttons && buttons.length > 0) {
      contentType = {
        'twilio/quick-reply': {
          body,
          actions: buttons.map((label: string) => ({ type: 'QUICK_REPLY', title: label })),
        },
      };
    } else {
      contentType = {
        'twilio/text': { body },
      };
    }

    const payload: Record<string, any> = {
      friendly_name: name,
      language: language || 'en',   // Twilio Content API requires a language (error 20001 if null)
      types: contentType,
    };
    if (Object.keys(variables).length > 0) {
      payload.variables = variables;
    }

    // 1. Create content template in Twilio
    const createRes = await fetch('https://content.twilio.com/v1/Content', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return NextResponse.json({ error: `Twilio create failed: ${err}` }, { status: 502 });
    }

    const created = await createRes.json();
    const sid: string = created.sid;

    // 2. Submit for WhatsApp approval
    const approvalRes = await fetch(
      `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          category,
        }),
      }
    );

    let approvalStatus = 'unknown';
    if (approvalRes.ok) {
      const approval = await approvalRes.json();
      approvalStatus = approval.whatsapp?.status ?? 'submitted';
    } else {
      const approvalErr = await approvalRes.text();
      console.warn('[Templates] WhatsApp approval submission failed:', approvalErr);
    }

    // 3. Sync to Supabase + bust cache so the page refreshes immediately
    try {
      await syncTemplatesToSupabase();
    } catch (e) {
      console.warn('[Templates] Post-create sync failed:', e);
    }

    return NextResponse.json({ success: true, sid, approvalStatus });
  } catch (error: any) {
    console.error('[Templates] Create error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
