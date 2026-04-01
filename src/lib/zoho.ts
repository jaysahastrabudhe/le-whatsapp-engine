import { config } from './config';
import { redisClient } from './queue/client';

const TOKEN_CACHE_KEY = 'le:zoho:access_token';
const ZOHO_BASE_URL = 'https://www.zohoapis.com/crm/v2';
const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2/token';

export interface ZohoUpdatePayload {
  WA_Reply_Class?: string;
  WA_Hotness?: string;
  WA_Last_Inbound_At?: string;
  WA_Last_Outbound_At?: string;
  WA_Last_Template?: string;
  WA_Opt_In?: boolean;
  WA_State?: string;
  WA_Track?: string;
}

/**
 * Gets a valid Zoho Access Token using the refresh token.
 * Caches the token in Redis until it expires (Zoho tokens last 60 min).
 */
export async function getZohoAccessToken(): Promise<string | null> {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = config;

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    console.warn('[Zoho] API credentials missing — writeback disabled.');
    return null;
  }

  // 1. Check Cache
  const cached = await redisClient.get<string>(TOKEN_CACHE_KEY);
  if (cached) return cached;

  // 2. Refresh Token
  console.log('[Zoho] Refreshing Access Token...');
  try {
    const params = new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });

    const res = await fetch(ZOHO_AUTH_URL, {
      method: 'POST',
      body: params,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Zoho Auth Error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Zoho Auth Error: No access_token in response: ${JSON.stringify(data)}`);
    }

    // 3. Cache it (expire slightly before the 1-hour limit)
    await redisClient.set(TOKEN_CACHE_KEY, data.access_token, { ex: 3300 }); // 55 mins

    return data.access_token;
  } catch (err) {
    console.error('[Zoho] Failed to refresh access token:', err);
    return null;
  }
}

/**
 * Creates a high-priority task in Zoho CRM linked to a lead.
 */
export async function createZohoTask(zohoLeadId: string, subject: string, description: string): Promise<boolean> {
  const token = await getZohoAccessToken();
  if (!token) return false;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`[Zoho Task] Creating task for lead ${zohoLeadId}: "${subject}"`);

  try {
    const res = await fetch(`${ZOHO_BASE_URL}/Tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{
          Subject:      subject,
          Due_Date:     today,
          Priority:     'High',
          Status:       'Not Started',
          What_Id:      { id: zohoLeadId },
          $se_module:   'Leads',
          Description:  description,
        }],
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(`Zoho Tasks API Error: ${res.status} ${JSON.stringify(errData)}`);
    }

    const result = await res.json();
    if (result.data && result.data[0].status === 'success') {
      console.log(`[Zoho Task] Created successfully for lead ${zohoLeadId}`);
      return true;
    } else {
      console.warn(`[Zoho Task] Unexpected response for ${zohoLeadId}:`, JSON.stringify(result));
      return false;
    }
  } catch (err) {
    console.error(`[Zoho Task] Failed to create task for lead ${zohoLeadId}:`, err);
    return false;
  }
}

/**
 * Updates a lead record in Zoho CRM.
 */
export async function updateZohoLead(zohoLeadId: string, fields: ZohoUpdatePayload) {
  const token = await getZohoAccessToken();
  if (!token) return;

  console.log(`[Zoho Writeback] Updating lead ${zohoLeadId}...`);

  try {
    const res = await fetch(`${ZOHO_BASE_URL}/Leads/${zohoLeadId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [fields],
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(`Zoho API Error: ${res.status} ${JSON.stringify(errData)}`);
    }

    const result = await res.json();
    if (result.data && result.data[0].status === 'success') {
      console.log(`[Zoho Writeback] Successfully updated lead ${zohoLeadId}`);
    } else {
      console.warn(`[Zoho Writeback] Update response for ${zohoLeadId}:`, JSON.stringify(result));
    }
  } catch (err) {
    console.error(`[Zoho Writeback] Failed to update lead ${zohoLeadId}:`, err);
  }
}
