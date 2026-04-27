# Changelog

All notable changes to the Let's Enterprise WhatsApp Engine project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [5.6.0] - 2026-04-27 (Call Log Overhaul + Zoho Stage Sync)

### Added
- **Stage-change webhook** (`/api/webhooks/zoho/stage-change`) — receives `id`/`Lead_Stage`/`Lead_Status` from a Zoho workflow rule on edit, updates Supabase within ~1 second. Closes the long-standing drift where leads moved out of MQL in Zoho stayed marked MQL locally. Requires a Zoho workflow rule on Leads module triggering on `Lead_Stage` or `Lead_Status` modified.
- **`Lead_Stage` and `Lead_Status` to reconcile cron payload** — failed immediate writebacks (call log → Zoho) are now retried by the hourly reconcile cron. Previously the daily MQL sync would overwrite Supabase back from Zoho if the immediate write failed.
- **No-answer attempt tracking** — Call Log modal counts consecutive `no_answer` call_logs since last `answered`/`call_back_later`. Shows attempt badge in modal header (×1, ×2, ⚠️ 3×) and pre-selects "Remove from SLA" at 3+ attempts. Soft threshold — team can override.
- **No-answer retry options** — when "No Answer" is selected, three explicit options replace the disabled placeholder: "Retry soon" (stays in queue), "Schedule retry" (date picker, hides until that date), "Remove from SLA" (closes lead).
- **AssignDropdown component** — inline assignment dropdown across SLA page sections. Discovery defaults to Gargi, Escalated defaults to Jonathan. Saves on change via `/api/admin/assign-lead`.
- **`/api/admin/assign-lead`** — PATCH endpoint to update `call_assigned_to` for a single lead.
- **Manual Entry pipeline counter** — uses `lead_events.event_type = 'csv_import'` to count leads that came in via the Import Replies CSV path, excluding `wa_closed`/`opted_out` states. Pipeline card now shows a real count instead of `—`.

### Changed
- **Call log state transitions restructured** — `nextAction` now always drives the state change. `nextAction === 'followup_on_date'` correctly sets `wa_state = 'call_follow_up'` (was incorrectly `call_queued`, causing scheduled leads to stay permanently visible in the queue instead of hiding until their date).
- **SLA page columns unified** across all five sections (Escalated, MQL Outreach, Pending Outreach, Discovery, Scheduled Callbacks): Lead + attempt badge + reply class | Lead Status | Hotness | Assigned To | Context | Action.
- **MQL Outreach sort stable** — changed from `updated_at` desc to `created_at` asc. Logging a call no longer reshuffles the list mid-session.
- **MQL box `lead_status` filter fixed** — query now includes rows where `lead_status IS NULL`. PostgreSQL evaluates `NULL NOT IN (list)` as `NULL` (unknown), which silently drops those rows. Box jumped from 26 visible to 92.
- **Campaign metrics computed live from `campaign_leads`** — removed the `generateCampaignReport` call at commit time which generated zero reports before any sends. Campaigns list page no longer reads `camp.report` (was preferring stale zeros over live counts).
- **statusProcessor propagates campaign_leads status** — when a Twilio status callback arrives (delivered/read/failed), the worker now updates `campaign_leads.status` to match. Previously `campaign_leads` was stuck on `sent` for the entire campaign lifecycle.

### Fixed
- **425 stale MQL records cleaned up** — one-time backfill compared all Supabase MQL leads against current Zoho state, downgraded 423 leads (where Zoho `Lead_Stage` was null/non-MQL) to match Zoho, kept 11 unverifiable (not found in Zoho) as-is. Supabase MQL count went from 536 → 113. Stage-change webhook prevents this drift from recurring.

### Documentation
- **`docs/team-workflow.md`** — added comprehensive SLA page logic reference: `wa_state` table, pipeline entry points, section visibility rules, call log state-transition table, no-answer attempt tracking, Zoho writeback gating, and **Zoho ↔ Supabase Sync Architecture** with the four sync paths and required Zoho config for the stage-change webhook.

---

## [5.5.0] - 2026-04-21 (Campaign Contacts Staging)

### Added
- **`campaign_contacts` staging table** — holds Zoho Contacts (or any record not yet in `leads`) for campaign sends. Columns: `zoho_id`, `zoho_module`, `name`, `phone_normalised`, `status` (`staging` → `promoted`), `promoted_lead_id`.
- **`zoho_module` column on `leads`** — `TEXT DEFAULT 'leads'`. Set to `'contacts'` when a staged contact is promoted. Controls whether Zoho writeback runs.
- **`contact_id` column on `campaign_leads`** — nullable FK to `campaign_contacts`. Either `lead_id` or `contact_id` is set per row.
- **Zoho Module dropdown in upload wizard** — Step 1 of the Zoho upload UI now has a "Zoho Module" selector (Leads / Contacts). Applies to the whole batch. Hint text explains the staging behaviour for Contacts.
- **Staged contact auto-promotion** — when a staged contact sends their first WhatsApp reply, the inbound processor inserts them into `leads` (with `zoho_module = 'contacts'`) and marks the `campaign_contacts` record as `promoted`. They then enter SLA flow normally.

### Changed
- **Preview route** — unmatched rows with a valid phone are now returned as `status: 'staged'` (not `skipped`). Summary includes `staged`, `sendable`, and `skipped` counts.
- **Commit route** — upserts staged contacts into `campaign_contacts` (dedup on `zoho_id + zoho_module`) before creating `campaign_leads`. Enqueues staged sends with `contactId` field instead of `leadId`.
- **`process-queue` cron** — campaign delivery status (`sent`) now written to `campaign_leads` by `contact_id` when `leadId` is absent.
- **Call log route** — fetches `zoho_module` for the lead before Zoho writeback. Skips note creation and field update for `contacts`-module leads to avoid API errors.
- **Zoho reconcile cron** — added `.neq('zoho_module', 'contacts')` filter. Contacts-module leads are silently excluded from hourly WA field sync.

---

## [5.4.0] - 2026-04-21 (Pipeline Visual Refinements)

### Fixed
- **WA Replied pipeline count** — was using `activeLeads` (SLA timer leads) which is near-zero once any call is logged. Changed to `wa_state = 'replied'` for accuracy.
- **WA Replied launch date filter** — old backlog of 79 pre-existing replied leads excluded. Counter starts from 2026-04-21 (call log system launch date) and accumulates unactioned replies going forward.
- **Resolved Today count removed** — was incorrectly using `updated_at` as a proxy for resolution date, causing inflated counts (leads in `wa_sla_resolved` touched by any update today were counted). Replaced with the Today card.
- **Today card** — replaces the Resolved box. Shows Calls Went Through / Not Gone Through / Call Back Later, all counted from `call_logs` since 6:00 AM IST. Accurate daily activity metric.
- **Scheduled card removed** from pipeline — not a meaningful pipeline stage for daily call operations.
- **Source cards widened** and pipeline **centre-aligned**.

---

## [5.3.0] - 2026-04-21 (SLA Pipeline Visual + MQL Sync Trigger + UX Fixes)

### Added
- **Lead Pipeline visual** — horizontal live-count strip at the top of the SLA Monitor page. Shows three entry sources (WA Replied, MQL from Zoho, Manual), Call Queue with pulsing red escalated badge, Discovery, Scheduled Callbacks, and Resolved Today. All counts server-rendered on page load. Scrolls horizontally on small screens.
- **Manual MQL Sync trigger** — "Sync from Zoho" button next to the MQL Outreach heading on the SLA page. Fires `mql-sync` cron immediately without waiting for the daily schedule. Shows live feedback (Syncing… → N processed → resets after 4s).
- **`/api/admin/trigger-cron`** — generic admin endpoint mapping cron names to their routes and firing them server-side with `CRON_SECRET`. Supports `mql-sync`, `zoho-reconcile`, `reengagement`, `sla-monitor`. Reusable `TriggerCronButton` component for any future cron trigger buttons.
- **Callback date picker on "Call Back Later"** — selecting "Call Back Later" as contact status now immediately shows a required date/time input. Auto-selects "Follow up later" as next action. Eliminates the extra step of picking next action separately.

### Changed
- **Ankita added to team members** — appears in the caller dropdown across all Log Call modals.

---

## [5.2.0] - 2026-04-21 (Zoho Writeback Completeness + Notes OAuth Fix)

### Added
- **`WA_Track` reconcile fallback** — `wa_track` added to `zoho-reconcile` SELECT and payload. Previously only written inline on track-button tap with no recovery if the write failed.

### Changed
- **Daily Inbound report** (`/admin/reports/daily-inbound`) — refactored to one row per lead (grouped by `lead_id || phone_normalised`). New "Msgs" count column; message column shows last 2 messages combined with ` · ` separator. Clicking any row navigates to the analytics message log pre-filtered for that lead.
- **`noteCreated` response in Call Log API** — was always `true` even on Zoho failure because `createZohoNote` return value was ignored. Now correctly reflects actual API success/failure.
- **Team members** — added Ankita to the caller dropdown in CallLogModal.

### Fixed
- **Zoho Notes OAuth scope** (`OAUTH_SCOPE_MISMATCH`) — the refresh token was generated without Notes access. Regenerated with `ZohoCRM.modules.ALL` scope. Notes from call logs now appear in Zoho CRM correctly.
- **`zoho_synced_at` not set on terminal state changes** — `WA_State` was stale in Zoho for most non-send transitions. Added `zoho_synced_at = null` to all places that change state without triggering a dispatch:
  - `rulesEngine.ts`: `wa_closed` (opt-out), `wa_manual_triage`, `wa_unrouted`
  - `statusProcessor.ts`: `opted_out`, `invalid_number` (these leads never get another outbound send to trigger reconcile)
  - `sla-monitor/route.ts`: `wa_sla_escalated`
  - `sla-resolve/route.ts`: `wa_sla_resolved`
- **`createZohoNote` error surfacing** — switched from `res.json()` to `res.text()` first, then `JSON.parse`. Raw Zoho error body now logged on failure (enabled diagnosis of the OAuth scope issue).

---

## [5.1.0] - 2026-04-21 (MQL Outreach + Reports + Zoho Fixes)

### Added
- **MQL Outreach Queue** — new amber box on SLA Monitor showing Zoho MQL-stage leads that haven't been contacted, disqualified, or marked junk. Excludes statuses: Contacted, Junk Lead, Lost Lead, Not Qualified.
- **MQL Sync Cron** (`/api/cron/mql-sync`) — pulls MQL leads from Zoho daily via `criteria=(Lead_Stage:equals:MQL)`, filters in-code (Zoho ignores criteria on custom fields), batch-upserts into Supabase. Inserts set `zoho_synced_at` immediately (already came from Zoho — no WA fields to write back, prevents reconcile queue flooding).
- **`lead_stage` / `lead_status` columns** on `leads` table — migration `20260421_lead_stage.sql`. Synced from Zoho on webhook upsert; written directly on call log.
- **Reports section** — new "Reports" card on Control Hub, `/admin/reports` index page with 3 sub-reports:
  - **Daily Call Log** (`/admin/reports/daily-calls`) — all calls logged on a given IST date, summary stats (total / answered / no-answer / call-back), breakdown by caller, full table with lead, status, next action, notes. Prev/Next date navigation.
  - **Daily Inbound Messages** (`/admin/reports/daily-inbound`) — all inbound WA replies on a given IST date, classification breakdown, hot leads callout, full table. Prev/Next date navigation.
  - **Undelivered Downloads** (`/admin/reports/undelivered-downloads`) — full history of failed-message CSV exports from `csv_imports` table. Today's download status callout (green ✅ / red ⚠️), total downloads / contacts / days with activity.
- **14-day activity log** on Reports index — table showing each of the last 14 days with calls logged, inbound messages, and whether the CSV was downloaded (clickable counts, "Not downloaded" in red for missed days).
- **14-day history strips** on Daily Call Log and Daily Inbound pages — clickable list of recent days with per-day counts, currently selected day highlighted.
- **Documentation** — `docs/zoho-writeback.md` (all Zoho fields written by each system component) and `docs/team-workflow.md` (8-step daily SOP table).

### Changed
- **Zoho Reconcile cron** — rewrote sequential `for` loop to `Promise.allSettled` for parallel processing. With 50 leads × ~1–2s each, sequential was hitting the 30s serverless timeout; parallel completes in ~3–5s.
- **Call Log API** (`/api/admin/call-log`) — Zoho field writeback and note creation are now **awaited** (was fire-and-forget). Returns `zoho: { fieldsWritten, noteCreated }` status in response.
- **CallLogModal** — added `mql_outreach` queue type; `getZohoDefaults()` auto-populates Lead Stage / Lead Status based on queue + next action. Zoho CRM Update section always visible with editable dropdowns. Sticky header, scrollable body.
- **CallLogWrapper** — amber button colour for `mql_outreach` queue.
- **Analytics Message Log** — renamed "Window" column to "SLA"; added green "Scheduled" pill for leads in `call_queued / call_follow_up / discovery_call / wa_sla_escalated` states.
- **ManualReplyForm** — rewritten with debounced typeahead search (220ms), dropdown showing matching leads with badges, required lead selection before submit. New `GET /api/admin/lead-search` endpoint (searches by name ilike or exact normalised phone).

### Fixed
- **Zoho Notes not appearing in CRM** — `POST /crm/v2/Notes` with `Parent_Id: zohoLeadId` (plain string) was silently failing. Switched to module-specific `POST /crm/v2/Leads/{id}/Notes` endpoint which requires only `Note_Title` and `Note_Content`.
- **Zoho Reconcile cron timing out** — sequential per-lead Zoho API calls hit 30s timeout. Fixed by parallelising with `Promise.allSettled`.
- **Zoho Reconcile cron URL malformed on cron-job.org** — URL was `...zoho-reconcilehttp:/` (concatenated). Fixed by updating job URL in cron-job.org.
- **Daily Inbound report showing empty** — `wa_reply_class` was included in the direct `messages` select but the column lives on `leads`. Supabase returned null data silently. Moved to `leads!lead_id(wa_reply_class)` join.
- **Manual reply phone normalisation** — `manual-reply/route.ts` was stripping `+` from the phone query, producing `91XXXXXXXXXX` vs Supabase's `+91XXXXXXXXXX`. Fixed by using `normaliseIndianPhone()`.

---

## [5.0.0] - 2026-04-20 (Campaigns Phase 2 + Unified Call Tracking & SLA Overhaul)

### Added
- **Campaign Manager — Phase 2 & 3**:
  - **Campaign Scheduling**: Support for `scheduled` status and `scheduled_at` timestamp.
  - **Global Deduplication Window**: Filter ensuring leads aren't messaged more than once within N days.
  - **Audience Preview**: Real-time lead count calculation when configuring campaign filters.
  - **Operational Guidelines**: Injected best practices and send-window rules into the builder UI.
  - **Launcher Cron** (`/api/cron/campaign-launcher`): Automatically initializes scheduled campaigns during the 9 AM - 8 PM IST window.
- **Unified Call Tracking System**:
  - **Call Logs Table**: Persistent store for caller name, timestamp, result, and notes.
  - **Manual Entry Form**: Fast-entry form on SLA monitor to manually add leads to calling queue.
  - **`Queue Call` button**: Injected into Analytics Message Log for manual queue injection of inbound leads.
  - **Scheduled Callbacks Box**: 4th monitor section for future-dated follow-ups.
- **Zoho Integration**:
  - **Automated Note Creation**: Call log results and notes automatically pushed to Zoho CRM lead records.
  - **SLA Resolution**: Logging a call automatically clears the `wa_human_response_due_at` timer.

### Changed
- **SLA Monitor Overhaul**:
  - Consolidated into three prioritized buckets: **Escalated**, **Pending Outreach** (WhatsApp + Manual Call Queue), and **Discovery Queue**.
  - Replaced the "Resolve" button with a unified **Log Call** workflow.
  - Standardized the CRM interface for all outreach types.
- **Campaign Dispatcher**: Updated to respect the global deduplication window and check `campaign.scheduled_at`.

### Fixed
- **Template Loading Bug**: Fixed an issue where the Zoho Upload page failed to load templates due to an array/object mismatch in the refresh API response.
- **State Transition Guard**: WhatsApp calls marked as "No Answer" now correctly move to the standard call queue state.

---

## [4.0.0] - 2026-04-01 (Follow-up Dedup + Zoho Batch Writeback + CSV Export/Import)

### Added
- **CSV Export of failed messages** (`GET /api/admin/export-failed`) — Downloads a CSV with lead name, phone, `wa.me` click-to-chat link, template body, error code + label, and lead ID. Accessible via "⬇ Export Failed CSV" button on the Message Log filter bar.
- **CSV Import of manual replies** (`/admin/import-replies`) — Full admin page with:
  - CSV upload (columns: `Phone`, `Reply Text`, `Replied At`)
  - Auto-classification via NLP classifier with **editable dropdown** per row
  - Confirm button commits to Supabase + marks leads dirty for Zoho reconcile
  - Deduplication: skips if same phone + reply text already exists
  - Results summary (imported / skipped / failed counts)
- **Import/Export audit log** (`csv_imports` Supabase table) — Tracks every import and export with row counts, success/fail, and per-row details. Last 10 shown on the import page.
- **Import/Export card** on Admin Control Hub — amber card linking to `/admin/import-replies`.
- **`zoho_synced_at` column** on `leads` table — NULL = needs Zoho sync. Set by dispatcher and inbound processor after state changes.
- **`track_selector_sent` state** — New `wa_state` value for Rule 6a progression, preventing Rule 6b from double-sending.
- **`/api/admin/import-replies/preview`** — POST endpoint for auto-classifying CSV rows before commit.
- **`/api/admin/import-replies/history`** — GET endpoint returning last 10 import/export logs.
- **`/api/admin/retry-unrouted`** — Helper endpoint to replay `wa_unrouted` leads against the Rules Engine after updating the workflow graph or syncing missing templates.

### Changed
- **Reengagement cron — optimistic locking** (`reengagement/route.ts`):
  - Rule 5: `UPDATE leads SET wa_state = 'followup_sent' WHERE wa_state = 'first_sent'` **before** enqueue (was after). If another cron run grabbed the lead, update affects 0 rows → skip.
  - Rule 6a: Sets `wa_state = 'track_selector_sent'` before enqueue (was leaving as `replied`).
  - Rule 6b: Adds `.eq('wa_state', 'replied')` optimistic lock before enqueue.
- **Rule 6 double-send guard** — Both Rule 6a and 6b queries now include `wa_last_outbound_at < wa_last_inbound_at` check, preventing multiple follow-ups for the same inbound reply.
- **Zoho reconcile cron expanded** (`zoho-reconcile/route.ts`) — Now syncs both outbound fields (`WA_State`, `WA_Last_Outbound_At`, `WA_Last_Template`) AND inbound fields (`WA_Reply_Class`, `WA_Hotness`, `WA_Last_Inbound_At`, `WA_Opt_In`). Picks up all leads with `zoho_synced_at IS NULL`.
- **Dispatcher** (`dispatcher.ts`) — Sets `zoho_synced_at = null` after successful send, marking lead dirty for reconcile.
- **Inbound processor** (`inboundProcessor.ts`) — Sets `zoho_synced_at = null` after classification update.
- **`ZohoUpdatePayload`** (`zoho.ts`) — Added `WA_State`, `WA_Last_Outbound_At`, `WA_Last_Template` fields.
- **`WORKFLOW_STATES`** (`constants.ts`) — Added `track_selector_sent`.

### Fixed
- **Follow-up double-send bug** — Rules 5 & 6 could send the same lead duplicate messages when cron runs overlapped. Fixed via optimistic locking pattern.
- **Rule 6 cross-contamination** — A lead could receive both `wa_track_selector` (6a) and `wa_followup_2_quickreply` (6b) because no guard prevented the second send after the first.
- **Template Sync UNIQUE Constraint Failure** — `templates` table sync silently failed to upsert templates recreated in Twilio with a new SID but the same name due to `UNIQUE(name)` constraint. Fixed by purging stale SIDs prior to upsert.

---

## [3.9.0] - 2026-03-30 (SLA Escalation + Manual Contact + Admin UI + Follow-up Config) (SLA Escalation + Manual Contact + Admin UI Overhaul)

### Added
- **Follow-up Logic config page** (`/admin/followup-config`) — editable UI for Rule 5 and Rule 6 settings. Toggle each rule on/off, change delay hours, swap templates via dropdown. No deploy required.
- **`followup_config` table** (Supabase) — single-row table with explicit typed columns for all 7 follow-up settings. Migration: `supabase/migrations/20260330_followup_config.sql`.
- **`GET/POST /api/admin/followup-config`** — reads/writes the config row. Returns hardcoded defaults if table doesn't exist (safe fallback).
- **Follow-up Logic card** on Control Hub (`/admin`) — violet card linking to the config page.

### Changed
- **Reengagement cron** (`/api/cron/reengagement/route.ts`) — now reads all settings from `followup_config` table on each run. Delay hours, templates, and enabled flags are all DB-driven. Falls back to hardcoded defaults if table is unavailable.

### Added
- **Zoho task creation on SLA breach** (`src/lib/zoho.ts` — `createZohoTask()`) — when a hot/warm lead breaches their 2h response SLA, a High-priority Zoho Task is created and linked directly to the lead record. Task body includes lead name, reply type, breach time, and assigned owner.
- **`/api/admin/mark-manual`** — marks a failed outbound lead as manually contacted from phone. Inserts an outbound `messages` row (`status='manual'`), sets `wa_state='wa_manual'`, and sets `wa_last_outbound_at` — which blocks the engine from auto-sending again.
- **`MarkManualButton`** (`src/components/MarkManualButton.tsx`) — appears on failed rows in the Message Log. One click flags the lead; refreshes the table automatically.
- **`/api/admin/sla-resolve`** — marks an active or escalated SLA lead as resolved. Sets `wa_state='wa_sla_resolved'`, clears `wa_human_response_due_at`.
- **`SlaResolveButton`** (`src/components/SlaResolveButton.tsx`) — Resolved button in the SLA Monitor on both active and escalated rows.
- **Message Log card** on the Control Hub (`/admin`) — separate card linking directly to `?tab=messages`.

### Changed
- **SLA cron rewritten** (`/api/cron/sla-monitor/route.ts`) — now fully implemented: calls `createZohoTask()` per breach, sets `wa_state='wa_sla_escalated'`, clears timer. Fixed `wa_closed` filter bug (was filtering `'closed'`, correct value is `'wa_closed'`).
- **SLA Monitor UI rewritten** (`/admin/sla-monitor`) — shows lead name + phone (was phone-only), hotness + reply class badges, SLA due time, countdown, Resolve button. Separate **Escalated** section for leads where Zoho task has been created. 3 summary cards (Active / Breached / Escalated).
- **Template Analytics card** on Control Hub now links to `?tab=performance` explicitly.
- **Message Log table** — removed Delivered and Read columns; added **Hotness** column (hot/warm/cold badge from lead record).
- **`manual` filter pill** added to Message Log. `manual` status badge added to `StatusBadge`.

---

## [3.8.0] - 2026-03-29 (Routing Audit Log + Graph Hardening + Bug Fixes)

### Added
- **Routing audit log** (`src/lib/engine/eventLogger.ts`) — every lead evaluation writes a `routing_decision` event to `lead_events` with: trigger source, graph_used flag, lead_source, persona, template selected, SID, and reason. Nothing is silent anymore.
- **`unrouted` status in analytics** — leads that the graph cannot route now get a `messages` row with `status='unrouted'`, `wa_state='wa_unrouted'`. Visible in Message Log with a grey `null` monospace pill. New `Unrouted` filter pill added.
- **Cycle detection in graph traversal** (`logicEvaluator.ts`) — `stepGraph` now carries a `visited: Set<string>`; hitting the same node twice aborts with `no_match` and logs an error instead of infinite recursion.

### Changed
- **Hardcoded fallback removed** (`rulesEngine.ts`) — `fallbackSelectTemplate()` deleted. If the Logic Builder graph returns `no_match`, lead is marked `wa_unrouted`, a visible message row is written, and a routing event is logged. No silent fallthrough.
- **`EvaluatedAction.reason` field** (`logicEvaluator.ts`) — graph traversal now returns a typed reason on every exit: `graph_match`, `graph_filtered_storysells`, `graph_filtered_no_relocate`, `graph_filtered_low_urgency`, `graph_unrouted`. End node label drives reason derivation.
- **Logic Builder graph — persona fallback subtree** — replaced `c8 false → wa_welcome_manual` (dumb catchall) with `c8 false → cP (persona == Parent?)` → parent/student branches. All leads get an explicit routing decision.
- **Logic Builder graph — urgency filter** — `c3` changed from `academic_level == 10th` to `urgency == LOW`. Now correctly catches all 8th/9th/10th grade leads (computed by webhook) not just exact "10th" string match.
- **Logic Builder graph — persona checks flipped** (`c5`, `c7`, `c9`) — changed from `persona == Student` to `persona == Parent` so the `false` branch (including null persona) defaults to student. Fixes "null persona → parent template" bug.
- **Campaign status lifecycle** — `campaigns.status` no longer set to `completed` immediately on launch. Stays `running` until the process-queue cron confirms all `campaign_leads` are dispatched (pending count == 0).
- **Urgency computation** — `computeUrgency()` now reads intake year field ("When are you looking to start your business degree") instead of school grade. `2026 Intake` → HIGH, `2027 Intake` → MEDIUM, `2028+` → LOW. Field mapping added to Zoho webhook handler.
- **Pulse indicator + Reply button** — restricted to inbound rows only (was showing on all rows for leads in the 24h window).
- **Free-form outbound messages** — Message Log now shows `row.content` as fallback when no template_id or SID — free-form replies sent via `/api/admin/send-reply` now display their text.

### Fixed
- `wa_welcome_meta_parent` being sent to null-persona Meta leads instead of `wa_welcome_meta_student` (persona check was inverted).

---

## [3.5.0] - 2026-03-28 (24h Reply Window Indicator + Free-Form Reply)

### Added
- **24h window pulse indicator** in Message Log — new "Window" column shows a green pulsing dot on every row for a lead whose `wa_last_inbound_at` is within the last 24 hours (the WhatsApp customer service window). Computed server-side at render time.
- **Free-form reply button** (`ReplyButton` client component) — appears alongside the pulse dot. Opens a modal with the lead's name, phone, a "window open" badge, and a textarea. ⌘+Enter shortcut supported.
- **`POST /api/admin/send-reply`** — validates 24h window server-side before calling Twilio. Sends free-form message using `body:` (not `contentSid:`). Records reply in `messages` table as outbound. Returns error if window has closed since page load.
- **`leads!lead_id(wa_last_inbound_at)`** added to Message Log query — enables per-row window calculation without an extra query.

---

## [3.4.0] - 2026-03-28 (Campaign Manager Overhaul)

### Added
- **Campaign creation — template dropdown**: Create campaign page is now an async server component. Fetches approved templates from Supabase/Twilio; shows name dropdown instead of raw HX SID input. `templateName` stored and passed through the queue payload for analytics tracking.
- **Campaign detail page** (`/admin/campaigns/[id]`) — full per-campaign dashboard:
  - Delivery funnel: Targeted → Sent → Delivered → Read → Replied (with % rate) → Failed
  - Funnel data sourced from `messages` table JOIN (real Twilio callback statuses), not `campaign_leads.status`
  - **Respondents table** — all inbound messages from campaign leads after campaign start, with lead name, phone, reply text, classification badge (interested/fee_question/not_now etc.), and IST timestamp
- **"View details →" link** on each campaign row in the campaigns list page
- **`campaignId` in queue payload** — added to `enqueueCampaignMessage` so the drain loop can update `campaign_leads`
- **`campaign_leads.status = 'sent'`** — updated after each successful dispatch in the campaign drain loop, so the list page funnel stats now populate
- **Campaign queue drain in `process-queue` cron** — drains `le:queue:campaign` separately from regular outbound

### Changed
- **Campaign rate limiting — jitter added**: Drain batch is now random 8–14 (was fixed 30) per cron tick. Messages are shuffled before dispatch to avoid sequential phone number patterns. Random 200–600ms sleep between each send. Fits within Vercel Hobby 10s function timeout. Effective throughput ~10/min (~600/hr).
- **`lead_source` filter** — uses `ilike` partial match (e.g. "Meta" matches "Meta Ads")
- **`contentVariables`** — campaign messages now pass `{ "1": lead.name || "there" }` automatically

---

## [3.3.3] - 2026-03-27 (Routing + Cooldown Fixes)

### Fixed
- **`lead_source` always null — wrong field name from Zoho**: Zoho sends `Lead_Source` (underscore, API name) but webhook only checked `lead_source` and `Lead Source` (space). Result: every lead got `wa_welcome_manual` regardless of actual source. Added `Lead_Source` and `Ad_Campaign_Name` underscore variants to mapping.
- **Cooldown never enforced — wrong column name**: Cooldown query used `.gt('created_at', ...)` but messages table has `sent_at`. Count was always 0, so the 2-message limit was never applied. Fixed to `sent_at`.
- **Dispatcher: redundant SID re-resolution**: Queue items carry already-resolved HX SIDs. Dispatcher was calling `getTwilioTemplateSid(HX...)` on them — always returned null, fell to last-resort fallback, logged noisy error. Now checks `startsWith('HX')` first and uses directly; only calls `getTwilioTemplateSid` for friendly name strings.

---

## [3.3.2] - 2026-03-27 (Templates Single Source of Truth)

### Added
- **`templates` Supabase table** (`20260327_templates_table.sql`) — persistent store for Twilio templates (`sid`, `name`, `status`, `body`, `fetched_at`, `updated_at`). Survives Redis flushes.
- **`syncTemplatesToSupabase()`** in `templates.ts` — fetches from Twilio Content API, upserts into Supabase, then repopulates Redis with 1hr TTL.
- **`KNOWN_TEMPLATES` list** in `constants.ts` — friendly name list for routing/UI. Replaces the hardcoded SID map.

### Changed
- **`getTwilioTemplateSid()`** — now resolves via Redis → Supabase → Twilio chain. Never reads from `constants.ts`. All SID lookups go through live data only.
- **`/api/admin/templates/refresh`** — calls `syncTemplatesToSupabase()` so Refresh button persists to Supabase, not just Redis.
- **`constants.ts`** — `TEMPLATE_SIDS` is now `{}` (all hardcoded SIDs removed). Was the root cause of stale/wrong SIDs overriding Twilio.
- **Analytics page** — removed `TEMPLATE_SIDS` import; `SID_TO_NAME` and `NAME_TO_SID` maps built purely from `getApprovedTemplates()` (Supabase-backed).
- **Message Log — text wrapping** — Template/Message column now wraps (`whitespace-pre-wrap break-words`) instead of truncating.

---

## [3.3.1] - 2026-03-27 (Post-Deploy Fixes + Inbound Message Log)

### Added
- **Message Log — inbound replies visible**: Message Log tab now shows both inbound and outbound rows. Inbound rows display reply text (italic), light indigo background, and a purple `inbound` pill. New `inbound` filter pill with count badge. Full conversation timeline visible in `All` view.

### Fixed
- **`sender_number` NOT NULL constraint**: Inbound message inserts were failing with `23502` — `sender_number` is NOT NULL in schema. Set to `cleanPhone` for inbound messages.
- **Zoho `WA_Last_Inbound_At` datetime format**: Zoho rejected ISO strings ending in `Z` and milliseconds (e.g. `2026-03-27T06:58:08.442Z`). Now formatted as `+00:00` offset (e.g. `2026-03-27T06:58:08+00:00`).
- **Dispatcher — failed Twilio attempts now recorded**: If `twilioClient.messages.create()` throws synchronously, a `status: 'failed'` row is now written to the `messages` table before re-throwing. Previously these were invisible in analytics (root cause of Nandini not appearing in Message Log).
- **Analytics timestamps in IST**: `formatTime()` was using server locale (UTC on Vercel). Added `timeZone: 'Asia/Kolkata'` to both date and time formatters.

---

## [3.3.0] - 2026-03-27 (Analytics Rewrite + Critical Bug Fixes — Full E2E Confirmed)

### Added
- **Analytics page — 2-tab layout** (`/admin/analytics`):
  - **Tab 1 (Template Performance):** enhanced with `error_code` column — shows most common Meta rejection code per template (63049, 63032, etc.) with plain-English labels. Delivery % and reply % preserved.
  - **Tab 2 (Message Log):** per-message visibility — lead name + masked phone, status badge (colour-coded), error code + label, sent/delivered/read timestamps, filter pills (all/failed/delivered/read/sent). Limit 200, joins `messages → leads` via FK. Tab selection via URL param (`?tab=messages`).
  - `ERROR_LABELS` map covering: 63049 (Meta marketing rejected), 63032 (opted out), 21211 (invalid number), 63016 (template not approved), 63033 (account suspended), 30008 (carrier filtering), 63003 (not a WhatsApp user).
- **`supabase/migrations/20260327_messages_error_code.sql`** — adds `error_code VARCHAR(20)` and `phone_normalised VARCHAR(20)` to `messages` table. Also adds performance indexes: `idx_messages_status`, `idx_messages_phone`, `idx_messages_sent_at`.
- **Backfill script** (`scripts/backfill-messages.ts`) — fetches today's outbound WhatsApp messages from Twilio API, matches to leads by `phone_normalised`, inserts into `messages` table (idempotent). Note: `template_variant_id` is null on backfilled rows (not available from Twilio list endpoint). Run with: `export $(cat .env.local | grep -v '^#' | xargs) && npx tsx scripts/backfill-messages.ts`.

### Fixed
- **CRITICAL — Messages table was empty since Week 1** (`src/lib/engine/dispatcher.ts`):
  - `body: message.body` → `content: message.body` (schema column is `content`, not `body`)
  - `created_at: new Date().toISOString()` → `sent_at: new Date().toISOString()` (schema column is `sent_at`, not `created_at`)
  - Root cause: these two field name mismatches caused every outbound message insert to fail silently. Analytics, cooldown enforcement, and status tracking were all broken as a result.
- **CRITICAL — Inbound replies never processed** (three cascading issues resolved):
  1. **Twilio Messaging Service config**: Inbound webhook URL was blank in Twilio Console → Messaging Services → Integration tab. Set to `https://le-whatsapp-engine.vercel.app/api/webhooks/twilio/inbound`.
  2. **Phone normalisation** (`src/lib/workers/inboundProcessor.ts`): Strip all non-digits first (`replace(/\D/g, '')`), then check 12-digit `91xxx` format before 10-digit. Fixes lookup failure for numbers without `+` prefix.
  3. **`lead_events` insert**: Removed non-existent `phone_normalised` column; added `lead_id`. Insert was silently failing for every inbound message.
- **Inbound message insert** (`src/lib/workers/inboundProcessor.ts`): `body` → `content`, `created_at` → `sent_at`, added `lead_id` and `phone_normalised` fields. Previously inbound messages were never saved.
- **Twilio signature validation** (`src/app/api/webhooks/twilio/inbound/route.ts`): `req.url` in Vercel serverless doesn't match Twilio's signed URL. Reconstructed from `x-forwarded-proto` + `x-forwarded-host` headers to match exactly what Twilio signed.
- **Cooldown enforcement** (was never working): `dispatcher.ts` queried `messages.phone_normalised` which didn't exist until this migration → count was always 0 → 2-message limit was never enforced. Fixed by adding the column.
- **Status processor lead updates** (was silently failing): `statusProcessor` tried to `select('phone_normalised')` from `messages` — column didn't exist → returned null → lead state was never updated from Twilio delivery callbacks. Fixed by adding the column.

### Changed
- **Next.js 16 `searchParams`**: Analytics page uses `searchParams: Promise<{...}>` (awaited in props) — required by Next.js 16 App Router server components.

---

## [3.2.0] - 2026-03-27 (Phase 2 — Admin Control & Visibility)

### Added
- **Global Engine Toggle (Kill Switch)**: `EngineToggle` client component in the Admin header. Toggle persists state to the `system_settings` Supabase table via a new `/api/admin/settings` GET/POST endpoint.
- **`system_settings` table**: New Supabase migration `20260327_system_settings.sql` with RLS and default `engine_enabled = true`.
- **Kill Switch enforcement**: Both `/api/webhooks/zoho` and `/api/webhooks/twilio/inbound` now check `engine_enabled` at entry and return `200 + "Engine paused"` immediately if disabled — no DB writes, no queued messages.
- **Zoho Field Mapping page** (`/admin/zoho-mapping`): Reference table showing Internal Key ↔ Zoho Merge Tag ↔ Purpose. Includes copy-ready recommended JSON payload for Zoho Webhook configuration.
- **"Zoho Field Mapping" card** added to the `/admin` dashboard grid.

### Changed
- **Admin Layout**: Reverted to clean header-only design with `EngineToggle` in the top right. Sidebar built and removed per UX preference.
- **Template cache**: Removed 1-hour TTL from Redis. Templates now stored indefinitely and only refreshed on manual Admin "Refresh" button press.
- **Dispatcher safety layer**: `dispatchMessage()` now calls `getTwilioTemplateSid()` immediately before the Twilio API call. Catches symbolic names or stale SIDs queued before the cache was refreshed.

---

## [3.1.0] - 2026-03-27 (Phase 1 Complete — Zoho CRM Integration & Multi-Source Mapping)

### Added
- **Zoho CRM Writeback** (`src/lib/zoho.ts`): Implemented OAuth 2.0 refresh token flow with Redis caching (55min TTL).
- **Active Sync**: `inboundProcessor.ts` now writes `WA_Reply_Class`, `WA_Hotness`, and `WA_Last_Inbound_At` to Zoho CRM in real-time.
- **Diagnostic Logging**: `inbound/route.ts` adds verbose raw body logging to verify `ButtonPayload` from Twilio.
- **Zoho Env Vars**: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` added to config schema.

### Changed
- **Multi-Field Mapping**: Zoho webhook now supports both internal and display names for `Program`, `Persona`, `Academic Level`, and `Relocation`.
- **Storysells Routing**: Workflow seed updated to route Storysells leads to `wa_welcome_manual` instead of silent skip.

### Fixed
- **Lead re-upsert sanity**: Contact updates from Zoho now preserve `wa_state` and `wa_opt_in` for leads already in sequence.
- **Payload Redeclaration**: Fixed a block-scope variable error in the Zoho webhook route.

---

## [3.0.0] - 2026-03-26 (Rules Engine v3 — Full Template Suite + Button Payloads)

### Added

#### Template Suite (all 10 templates registered)
- **`wa_welcome_meta_student`** (`HXd032c7b2d23d59cd56bbc71453b0afd6`) — Meta Ads, Student persona
- **`wa_welcome_meta_parent`** (`HXd97f088d39cd2f46bf189a3839eeb8ce`) — Meta Ads, Parent persona
- **`wa_welcome_organic_student`** (`HX5f55c702e5b379893cf79f9a0f492e6e`) — Website/Organic, Student persona
- **`wa_welcome_organic_parent`** (`HXdad3576db7480fcf3e61c780221df990`) — Website/Organic, Parent persona
- **`wa_welcome_manual`** (`HX754c828d62941b79c72589...`) — Manual/Phone/Instagram/Referral ✅ Approved
- **`wa_followup_1`** (`HX9a5464b3d23fcc28453d5a3...`) — 24h no-reply follow-up, hard stop ✅ Approved
- **`wa_followup_2_quickreply`** (`HX99c54dea1ea1d4fec682ee78452c0831`) — Post-reply 48h silence, 3-button quick reply
- **`wa_track_selector`** (`HXddf8ea9d9d01a0cc51dc6419909abb20`) — Track selection: Enterprise Leadership / Family Business / Venture Builder
- **`wa_webinar_cta`** (`HXe5d3fdede430efb27b5e7c50bed1b55a`) — Parent webinar RSVP, campaign-only
- **`wa_counsellor_intro`** (`HX98acc8cb7caf053b138a8fd...`) — Sent on interested/fee_question/track-selector tap ✅ Approved
- All 10 templates registered via **dynamic live lookup** from Twilio Content API — no static SIDs needed

#### Rules Engine v3 — Programmatic Rules 1–4
- **Rule 1 (Program filter):** Storysells leads routed to `wa_welcome_manual` (placeholder) instead of silent skip. All other programs continue.
- **Rule 2 (Relocation filter):** `relocate_to_pune = 'No'` → `wa_manual_triage` state, no WA message sent.
- **Rule 3 (Urgency):** `academic_level` mapped to urgency (`HIGH`/`MEDIUM`/`LOW`) at Zoho webhook intake. `LOW` (10th grade or below) → skip WA sequence entirely.
- **Rule 4 (Source × Persona routing):** Welcome template selected by cross-referencing `lead_source` × `persona`. Five distinct paths: Meta×Student, Meta×Parent, Organic×Student, Organic×Parent, Manual/everything else.
- `rulesEngine.ts` — evaluates Logic Builder graph first; falls back to programmatic Rules 1–4 if no graph is published or graph returns `no_match`.
- New `wa_state = 'first_sent'` set after enqueue (enables Rule 5 cron targeting).

#### Workflow Graph Seeded into Logic Builder
- `supabase/migrations/20260326_seed_workflow.sql` — inserts the complete Rules 1–4 decision tree as a React Flow graph into `workflow_rules` (static ID `00000000-0000-0000-0000-000000000001`).
- Graph is immediately editable via `/admin/logic-builder` — no redeploy needed to change routing logic.
- Graph nodes: Trigger(wa_pending) → Condition(program) → Condition(relocate_to_pune) → Condition(academic_level) → Condition(lead_source) → Condition(persona) → Action(template).

#### Logic Builder Enhancements
- **`GET /api/admin/workflow`** — new endpoint to load the saved graph from DB. Builder now loads the published graph on mount instead of always showing hardcoded initial nodes.
- **Per-field value dropdowns** — condition node editor now shows a typed dropdown (not free text) for every field with a fixed value set: `lead_source`, `persona`, `program`, `academic_level`, `relocate_to_pune`, `urgency`, `lead_track`, `wa_hotness`, `wa_reply_class`, `wa_state`.
- `FIELD_VALUES` map added to `constants.ts` — single source of truth for dropdown options across Builder and any future admin UI.

#### New Lead Fields (DB + Types)
- `supabase/migrations/20260326_new_lead_fields.sql` — adds 7 columns to `leads` table:
  - `program TEXT` — product line from Zoho form (BBA Pune, Storysells, etc.)
  - `persona TEXT` — Student or Parent
  - `academic_level TEXT` — 12th / 11th / 10th / Graduate / Already in college
  - `relocate_to_pune TEXT` — Yes / No
  - `urgency TEXT` — HIGH / MEDIUM / LOW (computed at intake from `academic_level`)
  - `lead_track TEXT` — enterprise_leadership / family_business / venture_builder (set by track selector button)
  - `webinar_rsvp BOOLEAN` — true / false / NULL (set by webinar CTA button)
- `Lead` type in `src/lib/supabase.ts` updated to include all new fields.

#### Zoho Webhook Enrichment
- `zoho/route.ts` now accepts `program`, `persona`, `academic_level`, `relocate_to_pune` from Zoho payload (all optional, null-safe).
- `computeUrgency()` helper: derives `HIGH`/`MEDIUM`/`LOW` from `academic_level` at intake time and writes to `leads.urgency`.
- Zoho webhook schema (`zohoPayloadSchema`) extended with new optional fields.

#### ButtonPayload Handling — Rule 8
- `inboundProcessor.ts` now detects `ButtonPayload` from Twilio quick reply taps **before** the NLP classifier runs.
- Full button map: `INTERESTED`, `MORE_INFO`, `DECIDED_AGAINST` (wa_followup_2 buttons), `ENTERPRISE_LEADERSHIP`, `FAMILY_BUSINESS`, `VENTURE_BUILDER` (track selector), `WEBINAR_YES`, `WEBINAR_NO` (webinar CTA).
- Track selector taps write `lead_track` to Supabase.
- Webinar taps write `webinar_rsvp` (true/false) to Supabase.
- `WEBINAR_YES` logs a counsellor flag (no auto-template — counsellor sends joining details manually).

#### Post-Classification Actions (Rule 8, Step C)
- `interested` or `fee_question` → auto-enqueues `wa_counsellor_intro` + sets `wa_human_response_due_at = now() + 2h`.
- Track selector taps (all 3 tracks) → also trigger `wa_counsellor_intro`.
- State transitions written to DB: `wa_hot`, `wa_nurture`, `wa_closed`, `replied` (for free-text `other` replies).
- `wa_opt_in = false` written immediately on `stop` classification (compliance — cannot wait for reconcile cron).
- Owner auto-assignment on `interested`/`fee_question` if no owner is set.
- All events logged to `lead_events` table with `event_type = 'button_tap'` or `'free_text_reply'`.

#### Follow-up Cron — Rules 5 & 6
- `/api/cron/reengagement` repurposed (was: 7-day dormancy cron with deprecated `wa_reengagement` template).
- **Rule 5** — 24h no-reply: targets `wa_state = 'first_sent'` + `wa_last_outbound_at < now()-24h` + `wa_last_inbound_at IS NULL` → sends `wa_followup_1`, sets state `followup_sent`.
- **Rule 6a** — 48h post-reply, no track: targets `wa_state = 'replied'` + `wa_last_inbound_at < now()-48h` + `lead_track IS NULL` → sends `wa_track_selector`.
- **Rule 6b** — 48h post-reply, track set: targets `wa_state = 'replied'` + `wa_last_inbound_at < now()-48h` + `lead_track IS NOT NULL` → sends `wa_followup_2_quickreply`.
- All three rules respect `wa_opt_in = true` and `isWithinSendWindow()` guard.
- Cron schedule unchanged: daily at 11:30 AM via cron-job.org (acceptable — max ~24h timing variance on follow-ups).

#### Constants Overhaul
- `WORKFLOW_STATES` updated: added `first_sent`, `followup_sent`, `replied`, `wa_hot`, `wa_nurture`, `wa_manual_triage`. Removed deprecated states.
- `LEAD_FIELDS` expanded: added `persona`, `program`, `academic_level`, `relocate_to_pune`, `urgency`, `lead_track`.
- `FIELD_VALUES` map introduced (replaces `SOURCE_VALUES`). `SOURCE_VALUES` kept as alias for backwards compatibility.

### Changed
- **`rulesEngine.ts`** — `wa_last_outbound_at !== null` guard added: welcome templates are never re-sent to leads already in sequence.
- **`rulesEngine.ts`** — `close` action from graph now sets `wa_state = 'wa_manual_triage'` (was: silent no-op).
- **`rulesEngine.ts`** — state after enqueueing changed from `wa_pending` to `first_sent`.
- **`inboundProcessor.ts`** — `wa_state` now written on every inbound (was: not written at all). State machine: `interested`/`fee_question` → `wa_hot`; `not_now` → `wa_nurture`; `stop`/`wrong_number` → `wa_closed`; `other` → `replied`.
- **Logic Builder** — condition node value field now driven by `FIELD_VALUES[field]` lookup. If no fixed values defined for a field, falls back to free text input.
- **`/api/cron/reengagement`** — fully repurposed. Old 7-day dormancy logic (using deprecated `wa_reengagement` template) replaced with Rules 5 & 6.

### Deprecated
- `wa_reengagement` template (`HXb0be78e0070d3153d3c1d5d62410b74a`) — retired from automated nurture. Kept in `TEMPLATE_SIDS` for reference. Re-engagement is now handled by `wa_followup_2_quickreply` (Rule 6b, post-reply) and campaigns (for cold/no-reply leads).
- `wa_welcome_meta`, `wa_welcome_organic`, `wa_welcome_meta_2` — superseded by the source×persona split templates. Kept in `TEMPLATE_SIDS` as legacy fallbacks.

---

## [2.5.1] - 2026-03-25 (Templates Page Polish)
### Fixed
- Narrowed Template Name and Content SID columns, widened Message Body column in `/admin/templates` table.

---

## [2.5.0] - 2026-03-25 (Admin UI Overhaul + Classification Engine)
### Added
- **DB-driven Reply Classification** (`src/lib/engine/classifier.ts`): Keywords per class stored in `classification_rules` Supabase table. Cached in Upstash Redis (30min TTL). Hardcoded fallback if DB unreachable.
- **`/admin/classification` page**: Edit keyword chips per class (interested, fee_question, not_now, wrong_number, stop, other). Add/remove/save with cache bust on save. Includes Hinglish keywords out of the box.
- **`/admin/templates` page**: Dedicated page showing all Twilio templates with approval status (approved/pending/rejected) and summary counts. Refresh button busts cache and reloads.
- **`/admin/analytics` page**: Template performance tracking — per-template sent/delivered/read/failed/replied counts, delivery % and reply % with colour-coded badges.
- **Campaign analytics inline**: `/admin/campaigns` now shows per-campaign funnel (total/sent/delivered/replied/failed) and reply rate % badge.
- **Shared admin layout** (`src/app/admin/layout.tsx`): Top nav bar with "Control Hub" home link across all admin pages.
- **`POST /api/admin/templates/refresh`**: Cache-bust endpoint for Twilio template list.
- **`GET /api/admin/templates`**: Returns live approved templates for Logic Builder dropdown.

### Fixed
- **Dark mode on admin UI**: Removed `prefers-color-scheme: dark` override from `globals.css` — admin tool always renders light.
- **Twilio Content API URL**: Was `/v1/Contents` (404) → corrected to `/v1/Content`. Approval status now fetched per-template via parallel `ApprovalRequests` calls.
- **Logic Builder canvas height**: Adjusted to `calc(100vh - 49px)` to account for new shared nav bar.

### Changed
- **Template discovery**: Logic Builder dropdown, rules engine, and analytics now pull templates live from Twilio Content API (cached). `constants.ts` remains as fast fallback only — no longer needs manual updates when templates are added/deleted.
- **`inboundProcessor.ts`**: Replaced hardcoded `if/else` classification block with `classifyReply()` call.
- **Admin hub**: 6-card grid (3-col) linking to all tools — Logic Builder, SLA Monitor, Campaigns, Classification, Analytics, Templates.

---

## [2.3.0] - 2026-03-25 (Outbound Delivery Confirmed)
### Added
- **`wa_welcome_meta_2` Template**: Resubmitted `wa_welcome_meta` as a utility category template. Approved SID: `HXf346638884dd3f8121e9e620319c289c`.
- Added `wa_welcome_meta_2` to `TEMPLATE_SIDS` in `constants.ts`.
- Updated Meta Ads fallback routing in `rulesEngine.ts` to use `wa_welcome_meta_2`.
- **Message body in templates page**: `/admin/templates` now shows full template body text per row, extracted from `types.twilio/text.body` in the Content API response.

### Fixed
- **Twilio 63027 — Resolved**: End-to-end delivery confirmed. Root cause was template category (marketing vs utility).

---

## [2.2.0] - 2026-03-25 (Outbound Dispatch Debugging & Documentation)
### Added
- **Messaging Service SID Support**: Dispatcher now requires `TWILIO_MESSAGING_SERVICE_SID` (MG...) env var.
- **Centralized Constants** (`src/lib/constants.ts`): Single source of truth for all template SIDs, workflow states, and lead fields.
- **Logic Builder Dropdowns**: Replaced free-form text inputs in the node properties panel with dynamic dropdowns.
- **Verbose Dispatcher Logging**: Dispatcher now logs the full Twilio payload and structured error on failure.
- **`TWILIO_MESSAGING_SERVICE_SID` Env Var**: Added to `config.ts` schema.

### Fixed
- **Twilio Error 63027 (Root Cause)**: Content API templates must be sent with `messagingServiceSid`.
- **Zoho Reconcile Cron 405**: Added `POST` handler to `/api/cron/zoho-reconcile`.
- **`contentVariables` Format**: Stopped passing `contentVariables: {}` for templates with no variables.
- **Cron Stripping Variables**: `process-queue` cron was not passing `contentVariables` from queue payloads to the dispatcher.
- **Lead Name Variable**: Rules engine now passes `{ "1": lead.name || "there" }` as content variables.

### Changed
- **Geo-Permissions**: User enabled India in Twilio Console → Geo Permissions.
- **Dispatcher Architecture**: `from` phone number is now a fallback only; `messagingServiceSid` takes priority.

---

## [2.1.0] - 2026-03-25 (Week 3 + Production Deployment)
### Added
- **SLA Monitor Dashboard**: Built `/admin/sla-monitor`.
- **Re-engagement Cron**: Created `/api/cron/reengagement` — daily sweep of leads dormant >7 days.
- **Source-Based Routing via Rules Engine**: Zoho webhook routes leads through `evaluateLeadAction()`.
- **Owner Assignment**: Inbound processor auto-assigns `owner_email` on favorable reply.
- **Centralized Admin Dashboard**: Created `/admin` as the unified control hub.
- **Root Redirect**: Visiting `/` now auto-redirects to `/admin`.

### Fixed
- **Queue Architecture Rewrite**: Replaced BullMQ with pure Upstash REST (`rpush`/`lpop`).
- **Cron Processor Timeout**: Removed 50-second `setTimeout` block.
- **Zod Schema Null Handling**: Made all optional fields `.nullable()`.
- **Vercel Build Config**: Added `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors`.

### Changed
- **Vercel Deployment**: Switched from GitHub auto-deploy to `vercel --prod --yes` CLI.
- **cron-job.org Integration**: Set up 4 external cron jobs.

---

## [2.0.0] - 2026-03-24 (Week 2: Stability + Campaigns)
### Added
- **Inbound Reply Processor** (`inboundProcessor.ts`): 6-class taxonomy classification.
- **Status Processor** (`statusProcessor.ts`): Delivery callbacks, error code handling.
- **Campaign Manager Module**: Segmentation, batch-enqueue, rate limiting.
- **Campaign Database**: `campaigns` and `campaign_leads` tables.
- **Campaign UI**: `/admin/campaigns` and `/admin/campaigns/create`.
- **SLA Monitor Cron**, **Zoho Reconciliation Cron**, **Cooldown Enforcement**, **Hot Lead Alerts**.
- **Visual Logic Builder UI**: React Flow canvas, workflow persistence, dynamic runtime evaluator.

---

## [1.0.0] - 2026-03-23 (Week 1: Core Plumbing)
### Added
- **Infrastructure**: Vercel + Next.js App Router + Supabase Postgres + Upstash Redis.
- **Database Schema**: `leads`, `messages`, `workflow_rules`, `sender_profiles`, `lead_events` tables.
- **Zod Config Validator**, **Webhooks** (Zoho HMAC, Twilio signature), **Rules Engine v1**, **Session Window**, **Twilio Dispatcher**, **Phone Normaliser**, **Queue Client**.
