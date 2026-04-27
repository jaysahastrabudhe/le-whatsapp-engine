# Team Daily Workflow

Standard operating procedure for the LE WhatsApp Engine. Follow these steps each day to keep the SLA board clear and leads progressing.

All steps are managed from the [SLA Monitor](/admin/sla-monitor).

---

| # | Task | When | Who |
|---|---|---|---|
| 1 | Check [Message Log](/admin/analytics?tab=messages) — review inbound replies, send responses within the 24h window, and Queue Call for leads worth phoning. | Morning | Jonathan |
| 2 | Export [Failed Messages CSV](/api/admin/export-failed) → send manually via WhatsApp Desktop for numbers the engine could not reach. | Morning | Jonathan |
| 3 | Import replies from manual WhatsApp messages via [Import / Export CSV](/admin/import-replies). Keeps lead status and hotness up to date. | Routinely | Jonathan |
| 4 | Handle **Escalated** leads at the top of the SLA Monitor — Zoho tasks have been raised for these. Clear them first. | Morning | Jonathan |
| 5 | Work through the **Pending Outreach** queue — log each call. Selecting "Set up discovery call" promotes the lead and clears the SLA timer. For leads with a ⚠️ badge (3+ unanswered attempts), consider closing them. | Routinely | Jonathan |
| 6 | Conduct **Discovery Calls** from the Discovery Queue. Once sold, log the call and mark as "Ready to Fill Form" to clear from the board. | Routinely | Gargi |
| 7 | Review **Scheduled Callbacks** — check who is due today and confirm or reschedule. | End of day | Jonathan |
| 8 | Review [Template Performance](/admin/analytics?tab=performance) — check delivery %, reply %, and top errors. Pause or replace under-performing templates. Also review Campaign results. | Weekly | — |

---

## SLA Page — How It Works

This section documents the rules that drive the SLA Monitor page so future changes don't accidentally break the flow.

### Lead States (`wa_state`)

Each lead has a `wa_state` field in the database. The SLA page uses this field — along with `followup_call_at` — to decide which section a lead appears in.

| `wa_state` | Appears In | Notes |
|---|---|---|
| `replied` | Pipeline "WA Replied" count | Lead replied to a WhatsApp; awaiting first call/response |
| `call_queued` | Pending Outreach (Call Queue) | Manually queued for a call |
| `call_follow_up` | Pending Outreach (when `followup_call_at` ≤ now) | Scheduled retry — hidden until the chosen date |
| `discovery_call` | Discovery Call Queue (when `followup_call_at` ≤ now or null) | Promoted from call queue after a successful call |
| `wa_sla_escalated` | Escalated section | Breached the 24h SLA; Zoho task was created automatically |
| `wa_sla_resolved` | Removed from all queues | Lead marked Ready to Fill Form |
| `wa_closed` | Removed from all queues | Lead disqualified / removed from SLA |
| `opted_out` | Removed from all queues | Lead sent STOP; no further contact |

**`followup_call_at` gating:** A lead with `call_follow_up` or `discovery_call` only becomes visible when the timestamp has passed. Until then it sits in Scheduled Callbacks.

### Pipeline Entry Points

The pipeline header shows three entry sources:

| Source | What it counts |
|---|---|
| **WA Replied** | Leads with `wa_state = 'replied'` and `wa_last_inbound_at` ≥ Apr 21 2026 (call log launch date). These are inbound replies awaiting a human response. |
| **MQL from Zoho** | Leads with `lead_stage = MQL` excluding statuses: Contacted, Junk Lead, Lost Lead, Not Qualified. Synced daily. |
| **Manual Entry** | Leads that entered via the Import Replies CSV (identified by a `lead_events` row with `event_type = 'csv_import'`), excluding those in `wa_closed` or `opted_out`. These are leads the engine failed to deliver to — the team messaged them manually on WhatsApp, they replied, and the team imported that reply. |

### SLA Sections and Their Visibility Rules

#### Escalated
- `wa_state = 'wa_sla_escalated'`
- Default assignee: Jonathan (dropdown available to change)
- Zoho task has already been created automatically — handle these first each day

#### MQL Outreach
- `lead_stage = 'MQL'` AND `lead_status` NOT IN (Contacted, Junk Lead, Lost Lead, Not Qualified)
- Sorted by `created_at` ascending (oldest first) — order is **stable**; logging a call does not reshuffle the list
- Default assignee: none (team picks)

#### Pending Outreach
- Combined view: **Call Queue** leads (`call_queued`, or `call_follow_up` with date ≤ now) + **WA Reply** leads (have a `wa_human_response_due_at` and are not escalated/resolved/closed)
- Sorted by urgency: call queue by follow-up date or queue time; WA replies by SLA deadline

#### Discovery Call Queue
- `wa_state = 'discovery_call'` AND (`followup_call_at` is null OR `followup_call_at` ≤ now)
- Default assignee: Gargi (dropdown available)

#### Scheduled Callbacks
- Any lead with `followup_call_at` in the future, regardless of `wa_state`
- Sorted ascending by scheduled time

---

### Call Log — State Transitions

When a call is logged, the `nextAction` field always drives the state change. `contactStatus` is only recorded for analytics; it does not directly set the state.

| `nextAction` | New `wa_state` | `followup_call_at` | Notes |
|---|---|---|---|
| `discovery_call` | `discovery_call` | cleared | Moves lead to Discovery Queue |
| `ready_to_fill` | `wa_sla_resolved` | cleared | Removes lead from all queues |
| `close_lead` | `wa_closed` | cleared | Removes lead from all queues; Zoho: Lead / Not Qualified |
| `followup_on_date` | `call_follow_up` | set to chosen date | Lead disappears until that date; then reappears in Pending Outreach |
| `followup_on_date` (from discovery queue) | `discovery_call` | set to chosen date | Keeps in discovery flow; reappears in Discovery Queue on that date |
| `no_answer` (no date, stay in queue) | unchanged (or `call_queued` if from WA reply) | unchanged | Lead stays visible in the same section |

**Key fix (Apr 2026):** Prior to this, `followup_on_date` incorrectly set `wa_state = 'call_queued'`, which meant scheduled leads would stay permanently visible in the queue instead of hiding until the follow-up date. The correct state is `call_follow_up`.

---

### No-Answer Attempt Tracking

The Call Log modal tracks how many consecutive unanswered call attempts a lead has had. The count resets after any `answered` or `call_back_later` call.

**How the count is computed:**
1. Load all call logs for the lead, sorted most-recent first
2. Walk the list; increment the counter for every `no_answer` entry
3. Stop counting when an `answered` or `call_back_later` entry is encountered

**What the team sees:**
- `×1`, `×2` badge — amber, informational
- `⚠️ 3×` or higher — red badge; "Remove from SLA" is pre-selected in the modal with a recommendation note

**Soft threshold:** 3 attempts. There is no hard block — the team can always override and retry. The badge is a nudge, not a gate.

**What "No Answer" options do:**
| Option | `nextAction` sent | Effect |
|---|---|---|
| Retry soon | `no_answer` | Lead stays visible in current queue |
| Schedule retry | `followup_on_date` + date | Lead hides until chosen date (`call_follow_up`), then reappears |
| Remove from SLA | `close_lead` | Lead moves to `wa_closed`, disappears from all queues |

---

### Zoho Writeback Gating

Leads promoted from a Zoho Upload campaign (Contacts module) have `zoho_module = 'contacts'` in the database. The call log route checks this before writing to Zoho:

- `zoho_module = 'leads'` (default) → Notes and field updates written to Zoho CRM immediately
- `zoho_module = 'contacts'` → Zoho writeback is **skipped** (these records don't exist in Zoho Leads)

This also applies to the hourly Zoho reconcile cron, which excludes contacts-module leads from the sync.

---

### Zoho ↔ Supabase Sync Architecture

There are **four independent paths** that keep `lead_stage` and `lead_status` in sync between Zoho and Supabase. Each fills a gap left by the others.

| Path | Direction | Trigger | Notes |
|---|---|---|---|
| **Lead webhook** (`/api/webhooks/zoho`) | Zoho → Supabase | New lead created in Zoho | Initial creation; sets `zoho_lead_id`, contact fields, and stage/status from the payload |
| **Stage-change webhook** (`/api/webhooks/zoho/stage-change`) | Zoho → Supabase | Workflow rule fires on `Lead_Stage` or `Lead_Status` modified | Real-time sync (~1s). Looks up by `zoho_lead_id`, no-ops if the value already matches |
| **MQL Sync cron** (`/api/cron/mql-sync`) | Zoho → Supabase | Daily | One-way pull of leads currently `Lead_Stage = MQL` in Zoho. Inserts new leads, updates existing |
| **Call log writeback + reconcile cron** | Supabase → Zoho | Team logs a call OR hourly reconcile sweep | Immediate write via `updateZohoLead`; if it fails, the next reconcile run retries (`Lead_Stage` and `Lead_Status` are included in the payload) |

#### Why all four are needed

- The lead webhook only fires on **creation**, not on subsequent stage changes
- The MQL Sync only ever sees leads currently marked MQL — it can't observe a lead being moved out of MQL
- Without the stage-change webhook, leads moved from MQL → SQL/Selection/Closing in Zoho stayed marked MQL in Supabase forever (this caused the "536 stale MQL" drift cleaned up on 2026-04-27)
- The reconcile cron retries any failed Supabase → Zoho writes so the daily MQL sync doesn't reverse a successful local update

#### Required Zoho configuration for the stage-change webhook

In Zoho CRM (Setup → Automation):

1. **Webhook** (Actions → Webhooks → Configure)
   - URL: `https://le-whatsapp-engine.vercel.app/api/webhooks/zoho/stage-change`
   - Method: `POST`, Body Type: **JSON Format**
   - Body content:
     ```json
     {
       "id": "${Leads.Lead Id}",
       "Lead_Stage": "${Leads.Lead Stage}",
       "Lead_Status": "${Leads.Lead Status}"
     }
     ```

2. **Workflow Rule** (Workflow Rules → Create Rule)
   - Module: Leads
   - When: On a record action → **Edit**
   - Condition: Specific Field(s) → `Lead Stage` and `Lead Status` → "Whenever the values are modified"
   - Filter Criteria: All Leads
   - Instant Action: associate the webhook above

A webhook on its own does not fire — it must be wrapped in a workflow rule.

---

## MQL Outreach

The **MQL Outreach** box shows leads in Zoho's MQL stage that haven't been contacted, disqualified, or marked as junk. These are warm inbound leads that need a first call.

- Synced from Zoho daily via the MQL Sync cron (`/api/cron/mql-sync`)
- Excluded statuses: Contacted, Junk Lead, Lost Lead, Not Qualified
- Sorted by `created_at` ascending — oldest leads first, stable order
- Log a call using the amber "Log Call" button — selecting "Set up discovery call" moves them into the main call queue

---

## Notes

- The 24h customer service window (free-form replies) resets on every inbound message from the lead
- Logging any call clears the WhatsApp SLA timer (`wa_human_response_due_at`) for that lead
- Leads marked "Remove from SLA" move to `wa_closed` state and disappear from all queues
- The **Assigned To** column is purely organisational — it does not affect routing or visibility
- Attempt badge counts only `no_answer` logs since the last answered call, not total ever
