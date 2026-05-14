import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getZohoAccessToken } from '@/lib/zoho';

const ZOHO_BASE_URL = 'https://www.zohoapis.com/crm/v2';
const FIELDS = 'id,Phone,Mobile,Full_Name,Email,Lead_Stage,Lead_Status';
const PAGE_SIZE = 200;

const AUTO_ASSIGN_MEMBERS = ['Sharjeel', 'Jonathan'] as const;
const DAILY_LIMIT = 20;

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

async function fetchMqlPage(token: string, page: number): Promise<{ records: any[]; more: boolean }> {
  const url = new URL(`${ZOHO_BASE_URL}/Leads`);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('criteria', '(Lead_Stage:equals:MQL)');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(PAGE_SIZE));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  });

  if (res.status === 204) return { records: [], more: false };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoho API ${res.status}: ${body}`);
  }

  const json = await res.json();
  return { records: json.data || [], more: json.info?.more_records ?? false };
}

export async function GET(request: Request) { return handleSync(request); }
export async function POST(request: Request) { return handleSync(request); }

async function handleSync(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('[MQL Sync] Starting...');

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: 'Could not get Zoho token' }, { status: 500 });

  // Fetch page 1 from Zoho (criteria may not filter correctly for custom fields)
  const { records: allRecords } = await fetchMqlPage(token, 1);
  // Filter in code — handles cases where Zoho ignores the criteria for custom field names
  const records = allRecords.filter(r => r.Lead_Stage === 'MQL');
  console.log(`[MQL Sync] Fetched ${allRecords.length} from Zoho, ${records.length} are MQL`);

  // Separate valid/invalid records
  type ZohoRec = { zohoId: string; phone: string; name: string | null; email: string | null; leadStage: string; leadStatus: string | null };
  const valid: ZohoRec[] = [];
  let totalSkipped = 0;

  for (const rec of records) {
    const phone = normalisePhone(rec.Phone || rec.Mobile);
    if (!phone) { totalSkipped++; continue; }
    valid.push({
      zohoId:      rec.id,
      phone,
      name:        rec.Full_Name || null,
      email:       rec.Email || null,
      leadStage:   rec.Lead_Stage || 'MQL',
      leadStatus:  rec.Lead_Status || null,
    });
  }

  if (valid.length === 0) {
    return NextResponse.json({ success: true, totalProcessed: 0, totalCreated: 0, totalUpdated: 0, totalSkipped });
  }

  // ── Auto-assign setup ────────────────────────────────────────────────────
  // Count MQL leads already assigned to each auto-assign member today (since 6am IST).
  // Uses created_at to count only leads introduced today — prevents the counter from
  // inflating on every resync of existing leads.
  const today6amIST = new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T06:00:00+05:30'
  ).toISOString();

  const { data: todayAssigned } = await supabase
    .from('leads')
    .select('call_assigned_to')
    .in('call_assigned_to', AUTO_ASSIGN_MEMBERS as unknown as string[])
    .eq('lead_stage', 'MQL')
    .gte('created_at', today6amIST);

  const assignCounts: Record<string, number> = { Sharjeel: 0, Jonathan: 0 };
  for (const row of todayAssigned || []) {
    if (row.call_assigned_to && row.call_assigned_to in assignCounts) {
      assignCounts[row.call_assigned_to]++;
    }
  }
  console.log('[MQL Sync] Auto-assign counts today:', assignCounts);

  // Returns next assignee (lowest count, under limit), or null when both at cap.
  // Mutates assignCounts so successive calls in this sync stay balanced.
  function nextAssignee(): string | null {
    const available = (AUTO_ASSIGN_MEMBERS as readonly string[])
      .filter(m => assignCounts[m] < DAILY_LIMIT)
      .sort((a, b) => assignCounts[a] - assignCounts[b]);
    if (available.length === 0) return null;
    const chosen = available[0];
    assignCounts[chosen]++;
    return chosen;
  }
  // ────────────────────────────────────────────────────────────────────────

  // Batch-fetch all matching leads from Supabase in ONE query
  const phones  = valid.map(r => r.phone);
  const zohoIds = valid.map(r => r.zohoId);

  const { data: existing } = await supabase
    .from('leads')
    .select('id, phone_normalised, zoho_lead_id, call_assigned_to')
    .or(`phone_normalised.in.(${phones.join(',')}),zoho_lead_id.in.(${zohoIds.join(',')})`);

  const existingByPhone  = new Map((existing || []).map(l => [l.phone_normalised, l]));
  const existingByZohoId = new Map((existing || []).map(l => [l.zoho_lead_id,     l]));

  const toUpdate: { id: string; lead_stage: string; lead_status: string | null; call_assigned_to?: string }[] = [];
  const toInsert: object[] = [];

  for (const rec of valid) {
    const existingRow = existingByPhone.get(rec.phone) || existingByZohoId.get(rec.zohoId);
    if (existingRow) {
      const update: typeof toUpdate[number] = {
        id: existingRow.id,
        lead_stage: rec.leadStage,
        lead_status: rec.leadStatus,
      };
      // Auto-assign only if currently unassigned
      if (!existingRow.call_assigned_to) {
        const assignee = nextAssignee();
        if (assignee) update.call_assigned_to = assignee;
      }
      toUpdate.push(update);
    } else {
      toInsert.push({
        zoho_lead_id:     rec.zohoId,
        phone_normalised: rec.phone,
        name:             rec.name,
        email:            rec.email,
        lead_stage:       rec.leadStage,
        lead_status:      rec.leadStatus,
        wa_state:         'wa_pending',
        wa_opt_in:        true,
        zoho_synced_at:   new Date().toISOString(),
        call_assigned_to: nextAssignee(),
      });
    }
  }

  // Batch update — run individual updates in parallel
  let totalUpdated = 0;
  let totalCreated = 0;
  const now = new Date().toISOString();

  if (toUpdate.length > 0) {
    const results = await Promise.all(
      toUpdate.map(r => {
        const fields: Record<string, any> = {
          lead_stage:  r.lead_stage,
          lead_status: r.lead_status,
          updated_at:  now,
        };
        if (r.call_assigned_to) fields.call_assigned_to = r.call_assigned_to;
        return supabase.from('leads').update(fields).eq('id', r.id);
      })
    );
    const errors = results.filter(r => r.error);
    if (errors.length > 0) console.error(`[MQL Sync] ${errors.length} update errors`);
    totalUpdated = toUpdate.length - errors.length;
  }

  // Batch insert new leads (in chunks of 50 to stay safe)
  const CHUNK = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await supabase.from('leads').insert(chunk);
    if (error) {
      console.error(`[MQL Sync] Batch insert error (chunk ${i}):`, error.message);
      totalSkipped += chunk.length;
    } else {
      totalCreated += chunk.length;
    }
  }

  const summary = { totalProcessed: valid.length + totalSkipped, totalCreated, totalUpdated, totalSkipped, assignCounts };
  console.log('[MQL Sync] Done:', summary);
  return NextResponse.json({ success: true, ...summary });
}
