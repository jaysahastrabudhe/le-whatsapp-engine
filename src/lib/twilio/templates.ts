import { redisClient } from '../queue/client';
import { supabase } from '../supabase';
import { config } from '../config';

const CACHE_KEY = 'le:twilio:templates';
const CACHE_TTL = 3600; // 1 hour

export type TemplateButton = {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | string;
  title: string;
  url?: string;
  phone?: string;
};

export type TwilioTemplate = {
  sid: string;
  name: string;
  status: string;
  body: string | null;
  buttons?: TemplateButton[];
  mediaUrl?: string | null;
  templateType?: string | null;
};

async function fetchFromTwilio(): Promise<TwilioTemplate[]> {
  const credentials = Buffer.from(
    `${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`
  ).toString('base64');
  const headers = { Authorization: `Basic ${credentials}` };

  const res = await fetch('https://content.twilio.com/v1/Content?PageSize=50', {
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Twilio Content API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const contents: any[] = data.contents || [];

  const results = await Promise.all(
    contents.map(async (c) => {
      try {
        const approvalRes = await fetch(
          `https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`,
          { headers, cache: 'no-store' }
        );
        if (!approvalRes.ok) return null;
        const approval = await approvalRes.json();
        const status: string = approval.whatsapp?.status ?? 'unknown';
        const typeKey: string | null =
          c.types?.['twilio/text'] ? 'twilio/text' :
          c.types?.['twilio/quick-reply'] ? 'twilio/quick-reply' :
          c.types?.['twilio/call-to-action'] ? 'twilio/call-to-action' :
          c.types?.['twilio/media'] ? 'twilio/media' :
          null;
        const typeObj = typeKey ? c.types[typeKey] : null;
        const body: string | null = typeObj?.body ?? null;

        const buttons: TemplateButton[] = (typeObj?.actions ?? []).map((a: any) => ({
          type:  a.type  ?? 'QUICK_REPLY',
          title: a.title ?? '',
          url:   a.url   ?? undefined,
          phone: a.phone ?? undefined,
        }));

        const mediaUrl: string | null =
          (c.types?.['twilio/media']?.media?.[0]) ?? null;

        return {
          sid:          c.sid as string,
          name:         c.friendly_name as string,
          status,
          body,
          buttons:      buttons.length > 0 ? buttons : undefined,
          mediaUrl:     mediaUrl ?? undefined,
          templateType: typeKey,
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((t): t is TwilioTemplate => t !== null);
}

/**
 * Fetch templates from Twilio and upsert into Supabase (persistent store).
 * Also repopulates the Redis cache.
 *
 * Strategy: delete stale rows first (SIDs that no longer exist in Twilio),
 * then upsert fresh data. This avoids UNIQUE(name) conflicts when a template
 * is deleted and recreated in Twilio with a new SID but the same name.
 */
export async function syncTemplatesToSupabase(): Promise<TwilioTemplate[]> {
  const templates = await fetchFromTwilio();
  const liveSids = templates.map((t) => t.sid);

  // 1. Delete templates that no longer exist in Twilio (stale SIDs with conflicting names)
  if (liveSids.length > 0) {
    const { error: deleteErr } = await supabase
      .from('templates')
      .delete()
      .not('sid', 'in', `(${liveSids.join(',')})`);

    if (deleteErr) {
      console.warn('[Templates] Stale cleanup failed:', deleteErr.message);
    }
  }

  // 2. Upsert fresh data
  const { error } = await supabase.from('templates').upsert(
    templates.map((t) => ({
      sid:        t.sid,
      name:       t.name,
      status:     t.status,
      body:       t.body,
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'sid' }
  );

  if (error) {
    console.error('[Templates] Supabase upsert failed:', error.message);
  } else {
    console.log(`[Templates] Synced ${templates.length} templates to Supabase.`);
  }

  await redisClient.set(CACHE_KEY, templates, { ex: CACHE_TTL });
  return templates;
}

/**
 * Get all templates. Redis → Supabase → Twilio (in that order).
 */
export async function getTwilioTemplates(): Promise<TwilioTemplate[]> {
  // 1. Redis cache
  const cached = await redisClient.get<TwilioTemplate[]>(CACHE_KEY);
  if (cached) return cached;

  // 2. Supabase persistent store
  const { data: rows } = await supabase
    .from('templates')
    .select('sid, name, status, body')
    .order('name');

  if (rows && rows.length > 0) {
    await redisClient.set(CACHE_KEY, rows, { ex: CACHE_TTL });
    return rows as TwilioTemplate[];
  }

  // 3. Live Twilio fetch + sync
  return syncTemplatesToSupabase();
}

export async function getApprovedTemplates(): Promise<TwilioTemplate[]> {
  const all = await getTwilioTemplates();
  return all.filter((t) => t.status === 'approved');
}

/**
 * Resolve a template friendly_name to its Twilio Content SID.
 * Reads from Supabase via cache — never from constants.ts.
 */
export async function getTwilioTemplateSid(name: string): Promise<string | null> {
  try {
    const templates = await getApprovedTemplates();
    return templates.find((t) => t.name === name)?.sid ?? null;
  } catch (err) {
    console.error('[Templates] SID lookup failed:', err);
    return null;
  }
}
