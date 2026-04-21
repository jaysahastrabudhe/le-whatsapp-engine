# Zoho Writeback Reference

All fields and notes the engine writes back to Zoho CRM, by source.

---

## Field Updates (`updateZohoLead`)

### Written by: Zoho Reconcile Cron (`/api/cron/zoho-reconcile`)
Runs hourly. Processes up to 50 leads with `zoho_synced_at IS NULL` in parallel.

| Zoho Field | What it stores |
|---|---|
| `WA_State` | Current WA workflow state (e.g. `call_queued`, `wa_sla_resolved`, `discovery_call`) |
| `WA_Last_Outbound_At` | Timestamp of last outbound WA message sent |
| `WA_Last_Template` | Name/SID of last template sent |
| `WA_Reply_Class` | Reply classification (`interested`, `not_now`, `fee_question`, `wrong_number`, `stop`) |
| `WA_Hotness` | Lead hotness score (`hot`, `warm`, `cold`) |
| `WA_Last_Inbound_At` | Timestamp of last inbound WA message |
| `WA_Opt_In` | Whether lead has opted in to WhatsApp (`true`/`false`) |

### Written by: Inbound Processor (`/lib/workers/inboundProcessor.ts`)
Fires on every inbound WhatsApp message. Written immediately (async, non-blocking).

| Zoho Field | What it stores |
|---|---|
| `WA_Reply_Class` | Reply classification result |
| `WA_Hotness` | Updated hotness after classification |
| `WA_Last_Inbound_At` | Timestamp of this inbound message |
| `WA_Opt_In` | Set to `false` on a `stop` reply |
| `WA_Track` | Track selected via quick-reply button (when applicable) |

### Written by: Call Log API (`/api/admin/call-log`)
Fires when a team member logs a call. Written immediately (awaited).

| Zoho Field | What it stores |
|---|---|
| `Lead_Stage` | CRM stage selected in the call log modal (Lead / MQL / SQL / Selection / Closing) |
| `Lead_Status` | CRM status selected (Contacted / Attempted to Contact / Not Qualified / etc.) |

---

## Notes (`createZohoNote`)

### Written by: Call Log API (`/api/admin/call-log`)
Created immediately when a call is logged (if notes are non-empty).

**Title format:** `Call Log: ANSWERED` / `Call Log: NO ANSWER` / etc.

**Content includes:**
- Caller name
- Next action (e.g. `DISCOVERY CALL`, `FOLLOW UP ON DATE`)
- Lead Stage change (if applicable)
- Lead Status change (if applicable)
- Free-text call notes
- Scheduled follow-up date (if `followup_on_date` was selected)

---

## Dirty Flag Pattern

Most WA field writes go through a dirty flag rather than writing to Zoho immediately:

1. Any update to WA fields in Supabase sets `zoho_synced_at = NULL`
2. The reconcile cron picks up all leads with `zoho_synced_at IS NULL` and writes them to Zoho in parallel
3. On success, `zoho_synced_at` is set to the current timestamp

**Exceptions** (written directly, not via reconcile):
- Inbound processor writes WA classification fields immediately (async fire-and-forget)
- Call log API writes `Lead_Stage` / `Lead_Status` immediately (awaited)
- Call log API also sets `zoho_synced_at = NULL` so the reconcile picks up the WA state change
