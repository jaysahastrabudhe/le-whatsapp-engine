# LE WhatsApp Automation — Project Execution Tracker
**Project:** ZOHO + Twilio WhatsApp Lead Engagement Engine
**Started:** 23 March 2026
**Last Updated:** 28 March 2026
**Status:** 🟢 PHASE 1, 2, 3.3–3.7 COMPLETE — Engine live; campaign manager overhauled; 24h reply window indicator + free-form reply live in message log.

> **How to use this file**
> - Mark tasks `[x]` when done, `[~]` when in progress, `[!]` when blocked
> - Add notes inline under any task — keep them brief
> - Update the **Last Updated** date above on every edit

---

## 📋 STATUS SUMMARY

| Phase | Tasks | Done | In Progress | Blocked |
|---|---|---|---|---|
| Pre-Build | 10 | 8 | 0 | 2 (Zoho custom fields + DPDP) |
| Week 1 — Go Live | 16 | 16 | 0 | 0 |
| Week 2 — Stability + Campaigns | 10 | 10 | 0 | 0 |
| Week 3 — Intelligence + Logic Builder | 8 | 8 | 0 | 0 |
| Week 4 — Optimisation | 10 | 7 | 0 | 0 |
| **Phase 1 — Rules Engine v3** | **10** | **9** | **0** | **1** |
| **Phase 2 — Admin Control** | **5** | **5** | **0** | **0** |
| **Phase 3.3 — Analytics & Bug Fixes** | **11** | **11** | **0** | **0** |
| **Phase 3.4 — Templates Architecture** | **6** | **6** | **0** | **0** |
| **Phase 3.5 — Routing & Cooldown Fixes** | **3** | **3** | **0** | **0** |
| **Phase 3.6 — Campaign Manager Overhaul** | **6** | **6** | **0** | **0** |
| **Phase 3.7 — 24h Window + Free-Form Reply** | **4** | **4** | **0** | **0** |
| Phase 3 — Next Sprint | 7 | 0 | 0 | 0 |
| Phase 4 — Future | 5 | 0 | 0 | 0 |

---

## 🔴 PHASE 0 — PRE-BUILD (Week 0)
> **Owner split:** Templates Agent (T) · Code Agent (C) · Human/Ops (H)

### Templates & Twilio — Templates Agent
- [x] Write final copy for all 10 WhatsApp templates (T)
  - Original set: `wa_welcome_meta`, `wa_welcome_organic`, `wa_welcome_manual`, `wa_followup_1`, `wa_followup_2`, `wa_reengagement`, `wa_counsellor_intro`, `wa_callback_confirm`, `wa_closed_loop`, `wa_not_eligible`
  - Revised set (v3.1, 25 Mar 2026): `wa_welcome_meta_student`, `wa_welcome_meta_parent`, `wa_welcome_organic_student`, `wa_welcome_organic_parent`, `wa_welcome_manual`, `wa_followup_1`, `wa_followup_2_quickreply`, `wa_track_selector`, `wa_webinar_cta`, `wa_counsellor_intro`
- [x] Submit all 10 templates to Twilio for approval (T)
  - 7 approved as of 26 Mar 2026
  - 3 pending: `wa_welcome_manual`, `wa_followup_1`, `wa_counsellor_intro`
- [x] Confirm per-number warmup schedule: 250 → 1,000 → 2,000 → 10,000 conversations/day (T)
  - Warmup started 24 Mar 2026. Current limit: 250/day from `+917709333161`
- [ ] Set up Twilio sandbox numbers for staging (T)

### Zoho Setup — Human/Ops
- [ ] Create Zoho custom fields on Leads module (H) ← **Phase 1 task — see P1.7**
  - Original list (11 fields): `WA_Opt_In`, `WA_State`, `WA_Hotness`, `WA_Last_Outbound_At`, `WA_Last_Inbound_At`, `WA_Last_Template`, `WA_Last_Status`, `WA_Sender_Key`, `WA_Reply_Class`, `WA_Last_Twilio_SID`, `WA_Human_Response_Due_At`
  - New fields required (Phase 1): `WA_Track` (picklist)
  - User to provide existing Zoho field list for conflict check before creation
- [ ] Create Zoho Workflow Rules to POST to `/api/webhooks/zoho` (H) ← **Phase 1 task — see P1.3**
  - Lead Created → POST with all mapped fields
  - Lead Stage Changed → POST with all mapped fields
  - Map Zoho field names to: `program`, `persona`, `academic_level`, `relocate_to_pune`

### Specs & Decisions — Code Agent + Ops
- [x] Write phone normalisation spec (all Indian number formats) (C)
- [x] Define reply classification taxonomy — 6 classes (C + H)
- [ ] Document DPDP consent flow: LP checkbox → Zoho WA_Opt_In field (H)
- [x] Decide: Queue system → Upstash REST rpush/lpop (C)
- [x] Decide: Postgres on Supabase (C)
- [x] Decide: Logic Builder auth — unprotected for Phase 1, NextAuth planned (C)

---

## 🟢 WEEK 1 — GO LIVE (Core Plumbing)
> Status: ✅ Complete.

- [x] Scaffold Next.js + TypeScript project on Vercel
- [x] Connect Supabase Postgres — run DB migrations, create all tables
- [x] Connect Upstash Redis — configure REST queue
- [x] Set up environment variables + secrets management (Vercel env vars)
- [x] Deploy health-check endpoint `/health`
- [x] Build `/webhooks/zoho` with HMAC secret validation
- [x] Build `/webhooks/twilio/inbound` with Twilio signature validation
- [x] Build `/webhooks/twilio/status` with Twilio signature validation
- [x] Build phone normaliser utility (all Indian formats → E.164)
- [x] Build Rules Engine v1 — reads from `workflow_rules` table
- [x] Enforce 24-hour session window (`WA_Last_Inbound_At`)
- [x] Enforce time-of-day send window (9am–8pm IST only)
- [x] Implement STOP / opt-out handler — set `WA_Opt_In = false`, halt all sends
- [x] Build Twilio API client (Content API template sends via Messaging Service SID)
- [x] Store outbound message in `messages` table
- [x] Build minimal event log viewer / queue worker (`/api/cron/process-queue`)

---

## ✅ WEEK 2 — STABILITY + CAMPAIGN LAYER
> Status: ✅ Complete.

- [x] Build inbound reply processor — classify against 6-class taxonomy
- [x] Writeback on inbound: `WA_Reply_Class`, `WA_Hotness`, `WA_Last_Inbound_At`
- [x] Handle Twilio error codes: `63016`, `63032`, `21211`
- [x] Implement idempotency keys (deduplication via MessageSid)
- [x] Build Dead Letter Queue — retry via queue config
- [x] Build Zoho reconciliation cron — `/api/cron/zoho-reconcile`
- [x] Enforce cooldown rules — max 2 outbound templates before any reply
- [x] Build hot lead alerts engine v1 — alert on `interested` classification
- [x] Monitor `WA_Human_Response_Due_At` for SLA breach alerts
- [x] Build Campaign Manager module (create, segment, enqueue, rate-limit)
- [x] Build campaign tracking (`campaign_leads` table)
- [x] Build Campaign Manager UI at `/admin/campaigns` and `/admin/campaigns/create`

---

## ✅ WEEK 3 — INTELLIGENCE + LOGIC BUILDER
> Status: ✅ Complete.

- [x] Build priority scoring engine (hot/warm/cold/dead via reply classification)
- [x] Build SLA tracker (`WA_Human_Response_Due_At` countdown + breach handling)
- [x] Build re-engagement sequence (originally: 7-day dormant → repurposed in Phase 1 to Rules 5 & 6)
- [x] Build source-based routing (Meta Ads / Organic / Manual → different first templates)
- [x] Define and implement owner assignment logic on favorable lead reply
- [x] Fix: Twilio Error 63027 — **Resolved**
  - Added `messagingServiceSid` (MG…) to dispatcher
  - Fixed empty `contentVariables: {}` causing 63027
  - Fixed `process-queue` cron stripping variables
  - Enabled India Geo Permissions
  - Set up Twilio Messaging Service (`MG4b7040930f5d63bc27d808429106136a`)
  - Resubmitted `wa_welcome_meta` as utility → approved as `wa_welcome_meta_2`
  - End-to-end delivery confirmed 25 Mar 2026
- [x] Fix: Zoho Reconcile 405/HTTP Error (Added POST support to cron route)
- [x] Build Logic Builder — visual FSM editor (React Flow)
- [x] Rules engine reads live from `workflow_rules` at runtime
- [x] Test: change rule via UI → rules engine picks it up without deploy
- [ ] Auth-protect Logic Builder — admin only

---

## 🟡 WEEK 4 — OPTIMISATION + MONITORING
> Status: 🟡 In Progress. Admin UI, analytics, and classification complete.

### Admin Dashboard
- [x] Build centralized Admin Dashboard (`/admin`) with card navigation to all tools
- [x] Root redirect (`/` → `/admin`)
- [x] Shared admin layout with top nav bar
- [x] Consistent light theme across all admin pages

### Reliability
- [x] Set up cron-job.org — 4 jobs: process-queue (1 min), sla-monitor (5 min), zoho-reconcile (60 min), reengagement (daily 11:30 AM)
- [x] Replace BullMQ raw TCP with Upstash REST rpush/lpop
- [ ] Add national holiday / suppression calendar
- [ ] Implement Zoho Bulk Write API for high-volume writeback batching
- [ ] Build retry with exponential backoff across all outbound calls

### Analytics & Dashboard
- [x] Build template performance tracking — `/admin/analytics`
- [x] Build campaign analytics inline on `/admin/campaigns`
- [x] `/admin/templates` — live Twilio template list with approval status
- [x] `/admin/classification` — DB-driven keyword editor
- [x] Auto-discover templates from Twilio Content API
- [ ] Build conversion tracking (lead stage FSM progression)
- [ ] Events list, lead detail view, message history per lead
- [ ] Sender quality score view
- [ ] Auto-pause campaign sends when sender quality score = LOW

---

## 🔵 PHASE 1 — RULES ENGINE v3 (26 March 2026)
> **Goal:** Complete Rules Engine v3 implementation, Zoho setup, and end-to-end testing.
> **Status:** ✅ COMPLETE. Engine live. E2E delivery confirmed 27 Mar 2026.

- [x] **P1.1 — Fix `wa_state` overwrite on re-upsert**
- [x] **P1.2 — Update Storysells branch in workflow graph**
- [x] **P1.3 — Zoho webhook field mapping** (Multi-source: JSON, form-encoded. Mobile > Phone fallback.)
- [x] **P1.4 — Run Supabase migrations on production**
- [x] **P1.5 — Verify `ButtonPayload` field name from Twilio** (Logging added)
- [x] **P1.6 — Set up Zoho API credentials (OAuth Self-Client)**
- [ ] **P1.7 — Create Zoho custom fields on Leads module** ← **User Action Pending**
  - **Core WA fields**: `WA_Opt_In` (Checkbox), `WA_State` (Single-line), `WA_Hotness` (Picklist), `WA_Reply_Class` (Picklist), `WA_Last_Inbound_At` (DateTime)
  - **New field**: `WA_Track` (Picklist: enterprise_leadership/family_business/venture_builder)
- [x] **P1.8 — Implement core Zoho writeback** (Activated in `inboundProcessor.ts`)
- [x] **P1.9 — Dynamic template SID resolution** — All 3 previously pending templates now confirmed approved. Engine uses live Twilio Content API lookup; no hardcoded SIDs.
- [x] **P1.10 — End-to-end test** — Confirmed 27 Mar 2026. Twilio accepted message. Meta 63049 error = marketing category on test number (not a code bug).

---

## 🟣 PHASE 2 — ADMIN CONTROL & VISIBILITY (27 March 2026) ✅ COMPLETE

- [x] **P2.1 — Global Engine Toggle (Kill Switch)**
  - `system_settings` table migration + `EngineToggle` component + `/api/admin/settings` API
  - Both Zoho and Twilio webhooks check `engine_enabled` before any processing
- [x] **P2.2 — Zoho Field Mapping page** (`/admin/zoho-mapping`)
  - Internal key ↔ Zoho merge tag reference table + recommended JSON payload
- [x] **P2.3 — Admin Dashboard update** — Zoho Mapping card added to grid
- [x] **P2.4 — Template cache persistence** — Removed 1-hour TTL; templates persist until manual Refresh
- [x] **P2.5 — Dispatcher safety layer** — Final SID resolution in `dispatchMessage()` before Twilio call


---

## 🟢 PHASE 3.3 — ANALYTICS & BUG FIXES (27 March 2026) ✅ COMPLETE

- [x] **P3.3.1 — Analytics page 2-tab rewrite** (`/admin/analytics`)
  - Tab 1 (Template Performance): added `error_code` column, `topError` per template, plain-English error labels
  - Tab 2 (Message Log): per-message log with lead name + masked phone, status badge, error code, timestamps, filter pills
  - Next.js 16: `searchParams` awaited as Promise in server component props
- [x] **P3.3.2 — Messages table migration** (`20260327_messages_error_code.sql`)
  - Added `error_code VARCHAR(20)` and `phone_normalised VARCHAR(20)` columns
  - Added performance indexes: `idx_messages_status`, `idx_messages_phone`, `idx_messages_sent_at`
- [x] **P3.3.3 — Dispatcher field name fix** (CRITICAL — messages table empty since Week 1)
  - `body` → `content`, `created_at` → `sent_at` in outbound message insert
  - Added `phone_normalised` to insert for cooldown enforcement
- [x] **P3.3.4 — Inbound processor fixes** (CRITICAL — inbound replies never processed)
  - Phone normalisation: strip all non-digits first, then pattern-match 12-digit vs 10-digit
  - Message insert: `body` → `content`, `created_at` → `sent_at`, added `lead_id`
  - `lead_events` insert: removed non-existent `phone_normalised`, added `lead_id`
- [x] **P3.3.5 — Inbound webhook URL fix** — Reconstructed from `x-forwarded-proto` + `x-forwarded-host` headers for correct Twilio signature validation in Vercel serverless
- [x] **P3.3.6 — Twilio console config** — Set inbound webhook URL in Messaging Service → Integration tab (was blank)
- [x] **P3.3.7 — Backfill script** (`scripts/backfill-messages.ts`) — idempotent fetch from Twilio API to populate historical messages. Confirmed 7 messages inserted.
- [x] **P3.3.8 — Post-deploy: inbound `sender_number` fix** — Messages table has NOT NULL on `sender_number`; inbound inserts were failing with `23502`. Set to `cleanPhone`.
- [x] **P3.3.9 — Post-deploy: Zoho datetime format fix** — `WA_Last_Inbound_At` rejected by Zoho (`expected_data_type: datetime`). Changed from `Z` suffix to `+00:00` offset.
- [x] **P3.3.10 — Post-deploy: analytics IST timezone** — `formatTime()` used server locale (UTC). Added `timeZone: Asia/Kolkata`.
- [x] **P3.3.11 — Message Log inbound visibility** — Removed `direction=outbound` filter; inbound replies now shown as separate rows with reply text, indigo styling, and `inbound` pill. `inbound` filter pill added.
- **Result:** Full E2E confirmed 27 Mar 2026: outbound send → Twilio delivery callback → inbound reply → classify → auto-reply (wa_counsellor_intro). Zoho writeback confirmed firing (token refresh + API call working). All message attempts (including failures) now visible in analytics.

---

## 🟢 PHASE 3.5 — ROUTING & COOLDOWN FIXES (27 March 2026) ✅ COMPLETE

- [x] **P3.5.1 — `lead_source` null fix** (`src/app/api/webhooks/zoho/route.ts`)
  - Zoho webhook sends `Lead_Source` (API name, underscore) not `Lead Source` (space)
  - `lead_source` was null for every lead → every lead fell through to `wa_welcome_manual`
  - Added `data['Lead_Source']` and `data['Ad_Campaign_Name']` underscore variants to field mapping
  - All new leads will now correctly route to meta/organic/manual templates per source × persona
  - Note: existing leads with null `lead_source` left as-is in Supabase (not backfilled)
- [x] **P3.5.2 — Cooldown `sent_at` fix** (`src/lib/engine/dispatcher.ts`)
  - Cooldown count query used `.gt('created_at', ...)` — column doesn't exist → count always 0
  - 2-message limit was never enforced since Week 1. Fixed to `sent_at`.
- [x] **P3.5.3 — Dispatcher double SID resolution fix**
  - Queue carries already-resolved HX SIDs; dispatcher was calling `getTwilioTemplateSid(HX...)` again → null → last-resort fallback → noisy error log
  - Now: if `contentSid.startsWith('HX')`, use directly. Only resolve if a friendly name is passed.
- **Result:** Source × persona routing now works correctly for new leads. Cooldown enforcement live. No more `"Could not resolve ContentSid"` errors in logs.

---

## 🟢 PHASE 3.4 — TEMPLATES ARCHITECTURE (27 March 2026) ✅ COMPLETE

- [x] **P3.4.1 — Supabase `templates` table** (`20260327_templates_table.sql`)
  - Columns: `sid` (PK), `name` (UNIQUE), `status`, `body`, `fetched_at`, `updated_at`
  - Indexes: `idx_templates_name`, `idx_templates_status`
  - Survives Redis flushes; single persistent store for all template metadata
- [x] **P3.4.2 — `syncTemplatesToSupabase()`** in `src/lib/twilio/templates.ts`
  - Fetches from Twilio Content API → upserts Supabase → populates Redis (1hr TTL)
  - Resolution chain: Redis → Supabase → live Twilio (in that order)
- [x] **P3.4.3 — Refresh route updated** — `/api/admin/templates/refresh` now calls `syncTemplatesToSupabase()` so the Refresh button in `/admin/templates` writes through to Supabase
- [x] **P3.4.4 — `constants.ts` SIDs stripped** — `TEMPLATE_SIDS = {}`. Was short-circuiting `getTwilioTemplateSid()` with stale/wrong hardcoded values. Added `KNOWN_TEMPLATES` list for routing/UI reference.
- [x] **P3.4.5 — Analytics SID↔name maps** — Removed `TEMPLATE_SIDS` import; maps now built purely from `getApprovedTemplates()` (Supabase-backed)
- [x] **P3.4.6 — Message Log text wrapping** — Template/Message column was truncating; now uses `whitespace-pre-wrap break-words`
- **Result:** Single source of truth for templates established. All SID resolution goes through Supabase → Redis → Twilio. No hardcoded SIDs anywhere in codebase.

---

## 🟢 PHASE 3.6 — CAMPAIGN MANAGER OVERHAUL (28 March 2026) ✅ COMPLETE

- [x] **P3.6.1 — Template dropdown on campaign create page**
  - Create campaign page rewritten as async server component; fetches approved templates from Supabase/Twilio
  - Template name + SID captured separately; `templateName` passed through queue payload for analytics
- [x] **P3.6.2 — contentVariables with lead name**
  - Campaign messages now include `{ "1": lead.name || "there" }` as contentVariables automatically
- [x] **P3.6.3 — Campaign queue drain with jitter**
  - Random batch size 8–14 per cron tick (was fixed 30)
  - Messages shuffled before dispatch to avoid sequential number patterns
  - 200–600ms random sleep between each send — fits Vercel Hobby 10s timeout
  - Effective throughput ~10/min ≈ 600/hr
- [x] **P3.6.4 — `campaign_leads.status` tracking**
  - `campaignId` + `leadId` added to queue payload
  - After each successful dispatch, `campaign_leads.status = 'sent'` + `sent_at` updated in Supabase
  - Campaigns list funnel stats now populate correctly
- [x] **P3.6.5 — Campaign detail page** (`/admin/campaigns/[id]`)
  - Full delivery funnel: Targeted → Sent → Delivered → Read → Replied (with %) → Failed
  - Sent from `campaign_leads`; Delivered/Read/Failed from `messages` table JOIN (real Twilio callbacks)
  - Respondents table: inbound replies from campaign leads after campaign start (name, phone, text, classification, IST time)
- [x] **P3.6.6 — "View details →" links on campaigns list page**

---

## 🟢 PHASE 3.7 — 24H REPLY WINDOW + FREE-FORM REPLY (28 March 2026) ✅ COMPLETE

- [x] **P3.7.1 — 24h window pulse in Message Log**
  - New "Window" column in message log table
  - Green `animate-pulse` dot shown on every row where `wa_last_inbound_at > now - 24h`
  - Computed server-side from `leads!lead_id(wa_last_inbound_at)` join (no extra query)
- [x] **P3.7.2 — ReplyButton client component** (`src/components/ReplyButton.tsx`)
  - Modal with lead name, phone, "window open" badge, textarea, ⌘+Enter shortcut
  - Error state shows API error message; success auto-closes after 1.8s
- [x] **P3.7.3 — `POST /api/admin/send-reply` endpoint**
  - Validates 24h window server-side before any Twilio call
  - Sends free-form message via `body:` (works within customer service window, no template needed)
  - Inserts outbound record into `messages` table
- [x] **P3.7.4 — Message Log query update**
  - Added `lead_id` and `wa_last_inbound_at` to select; `colSpan` updated to 8

---

## 🟠 PHASE 3 — NEXT SPRINT

- [ ] **P2.1 — Follow-up cron deduplication**
  - Set new `wa_state` atomically *before* enqueuing in Rules 5 & 6 (not after).
  - Prevents a lead from being matched again on the next cron run while still in the dispatch queue.

- [ ] **P2.2 — Rule 6 double-send guard**
  - Add `wa_last_outbound_at < wa_last_inbound_at` check to Rule 6 query.
  - Prevents a lead who already received `wa_track_selector` from also getting `wa_followup_2_quickreply` 48h later.

- [ ] **P2.3 — Named flow save/open in Logic Builder**
  - Allow multiple `workflow_rules` rows. One row `is_active = true` evaluated at runtime.
  - UI additions: flow list panel (list / open / duplicate / create new), active/draft toggle, flow name editing.
  - Enables versioning and A/B draft testing of routing logic.

- [ ] **P2.4 — Editable button payload map**
  - Admin UI (similar to `/admin/classification`) where button postback IDs are mapped to reply class, hotness, state transition, and special actions (`lead_track`, `webinar_rsvp`, counsellor flag).
  - Eliminates code change requirement for every new quick reply template.

- [ ] **P2.5 — Campaign reply awareness**
  - Use `wa_last_template` in `inboundProcessor` to suppress specific downstream actions for campaign-originated replies.
  - Specifically: `WEBINAR_YES` tap → flag counsellor but do NOT auto-send `wa_counsellor_intro` (counsellor sends joining details manually).

- [ ] **P2.6 — Expanded Zoho writeback**
  - After outbound send: write `WA_State`, `WA_Last_Outbound_At`, `WA_Last_Template`.
  - On track selector tap: write `WA_Track` picklist value.
  - On hot lead: create Zoho Task ("Call [Name] — WA Hot Lead", due in 2h, assigned to owner).

- [ ] **P2.7 — Storysells proper template**
  - Create a Storysells-specific WhatsApp template in Twilio and get it approved.
  - Update Logic Builder routing: `program = Storysells` → new Storysells template (replace `wa_welcome_manual` placeholder).

---

## ⚪ PHASE 3 — FUTURE

- [ ] **P3.1 — Multiple independent flows**
  - Support more than one active flow evaluated in parallel (e.g., BBA Pune flow, Storysells flow).
  - `rulesEngine.ts` selects the right flow based on a top-level lead field (e.g., `program`).

- [ ] **P3.2 — End node differentiation**
  - Different outcomes for different End nodes in the graph.
  - Currently all End nodes behave identically (`wa_manual_triage`).
  - Future: silent skip, Zoho task, email alert, SMS fallback — configurable per End node.

- [ ] **P3.3 — CSV import for contacts campaigns**
  - Admin UI to upload a CSV of contacts into a temporary Supabase table (`contacts_import`).
  - Columns: phone, name, and any segment fields.
  - Campaigns can target this table in addition to the existing `leads` table.

- [ ] **P3.4 — Contacts campaign runner**
  - Campaign creation UI supports selecting source: existing `leads` (with filters) or an imported `contacts_import` batch.
  - Rate-limiting, dispatch queue, and delivery tracking apply equally to both.

- [ ] **P3.5 — Lead data strategy review**
  - Formal review of long-term Supabase vs Zoho data model.
  - Current model (Supabase = WA state mirror, Zoho = source of truth) works well.
  - Review once Zoho writeback is mature and volume is clear.

---

## 🧱 BLOCKERS LOG

| # | Raised | Blocker | Owner | Status | Resolution |
|---|---|---|---|---|---|
| 1 | 23 Mar | Template approval needed before Week 1 | Templates Agent | ✅ Resolved | Setup completed by User in Twilio |
| 2 | 23 Mar | BullMQ worker: Vercel Cron vs Railway decision needed | Code Agent | ✅ Resolved | Vercel Cron + cron-job.org (BullMQ replaced with Upstash REST) |
| 3 | 23 Mar | Postgres provider: Neon vs Supabase | Code Agent | ✅ Resolved | Supabase chosen |
| 4 | 23 Mar | Logic Builder auth method | Code Agent | ✅ Resolved | NextAuth planned, unprotected for Phase 1 |
| 5 | 24 Mar | Vercel Hobby plan limits crons to daily only | Code Agent | ✅ Resolved | External cron-job.org handles per-minute scheduling |
| 6 | 24 Mar | BullMQ TCP incompatible with Upstash serverless | Code Agent | ✅ Resolved | Replaced with pure Upstash REST rpush/lpop |
| 7 | 24 Mar | Vercel GitHub webhook stopped triggering builds | Ops | ✅ Resolved | Using `vercel --prod` CLI deploys |
| 8 | 25 Mar | Twilio error 63027 — templates not delivering | Code Agent | ✅ Resolved | Resubmitted template as utility category. E2E delivery confirmed 25 Mar 2026. |
| 9 | 25 Mar | Twilio Geo Permissions blocked India delivery | Ops | ✅ Resolved | User enabled India in Twilio Console → Geo Permissions |
| 10 | 25 Mar | Messaging Service A2P 10DLC blocked WhatsApp sender | Ops | ✅ Resolved | Used WhatsApp-specific sender flow to bypass A2P SMS requirement |
| 11 | 26 Mar | Zoho API credentials not set up — writeback non-functional | Ops | ✅ Resolved | `zoho.ts` implemented with OAuth 2.0 refresh token flow (P1.6) |
| 12 | 26 Mar | 3 templates pending Twilio approval (`wa_welcome_manual`, `wa_followup_1`, `wa_counsellor_intro`) | Templates Agent | ✅ Resolved | All 3 confirmed approved 27 Mar. Dynamic lookup active; no code updates needed. |
| 13 | 26 Mar | ButtonPayload field name from Twilio unverified | Code Agent | ✅ Resolved | Logging added to inbound webhook; verified in Vercel logs. |
| 14 | 26 Mar | Zoho field mapping not yet done | Ops | ✅ Resolved | Multi-source fuzzy mapping in `zoho/route.ts`; Mobile > Phone fallback added. |
| 15 | 27 Mar | Messages table empty since Week 1 — analytics/cooldown/status all broken | Code Agent | ✅ Resolved | Two field name mismatches in `dispatcher.ts`: `body`→`content`, `created_at`→`sent_at`. Silent Supabase failures since launch. |
| 16 | 27 Mar | Inbound replies never processed — NLP classifier and state machine unreachable | Code Agent + Ops | ✅ Resolved | Three causes: (1) Twilio Messaging Service Integration tab had blank inbound URL — set to production URL. (2) Phone normalisation stripped `+` before E.164 check → no lead found. (3) `lead_events` insert referenced non-existent column. All three fixed. |
| 17 | 27 Mar | Twilio signature validation blocked inbound in Vercel serverless | Code Agent | ✅ Resolved | `req.url` returns internal Vercel hostname — doesn't match Twilio's signed URL. Fixed by reconstructing from `x-forwarded-proto` + `x-forwarded-host` headers. |
| 18 | 27 Mar | `sender_number` NOT NULL constraint failing inbound message inserts | Code Agent | ✅ Resolved | `sender_number` not set on inbound inserts → `23502` error. Set to `cleanPhone` for inbound messages. |
| 19 | 27 Mar | Zoho `WA_Last_Inbound_At` rejected — invalid datetime format | Code Agent | ✅ Resolved | ISO string `...Z` not accepted by Zoho datetime fields. Reformatted to `+00:00` offset. |
| 20 | 27 Mar | Analytics timestamps displayed in UTC (Vercel server time) | Code Agent | ✅ Resolved | Added `timeZone: Asia/Kolkata` to `formatTime()`. |

---

## 📝 DECISIONS LOG

| Date | Decision | Chosen | Alternatives Considered |
|---|---|---|---|
| 23 Mar | Hosting | Vercel (serverless) | Railway, EC2, Render |
| 23 Mar | Messaging provider | Twilio WhatsApp | 360dialog, WATI |
| 23 Mar | Human handover channel | Zoho Task + Email | Slack, WhatsApp group |
| 23 Mar | Opt-in method | LP form checkbox | Post-capture consent DM |
| 23 Mar | Rules engine config | DB-driven (Logic Builder graph) | Hardcoded / YAML config |
| 23 Mar | Campaign rate limit | 30 msg/min (default) | TBD based on warmup |
| 24 Mar | Queue system | Upstash REST (rpush/lpop) | BullMQ (incompatible with serverless) |
| 24 Mar | Cron scheduling | cron-job.org (free) | Vercel Cron (Hobby plan limits) |
| 24 Mar | Deploy method | `vercel --prod` CLI | GitHub auto-deploy (webhook broken) |
| 23 Mar | Admin dashboard | Centralized `/admin` hub | Separate standalone pages |
| 25 Mar | Content API template delivery | Must use `messagingServiceSid` with Content SIDs (HX...) | Sending from bare phone number (unsupported since Apr 2025) |
| 25 Mar | Template variable format | Omit `contentVariables` entirely when empty | Pass `contentVariables: {}` (broken — causes 63027) |
| 25 Mar | Template discovery | Live Twilio Content API with Upstash persistent cache (no TTL — manual Admin Refresh only) | Manual `constants.ts` updates; 1hr TTL removed in Phase 2 |
| 25 Mar | Reply classification | DB-driven keyword rules (`classification_rules` table, Redis cache 30min) | Hardcoded if/else |
| 26 Mar | Rules engine architecture | Graph-first (Logic Builder), code fallback for Rules 1–4 | Hardcoded routing only |
| 26 Mar | Welcome template routing | Source × Persona (5 paths: Meta×Student, Meta×Parent, Organic×Student, Organic×Parent, Manual) | Single template per source (no persona split) |
| 26 Mar | Storysells handling | Route to `wa_welcome_manual` placeholder; proper template in Phase 2 | Silent skip (no WA message) |
| 26 Mar | Follow-up cron timing | Once daily at 11:30 AM (acceptable ~24h variance) | Per-hour (over-engineering for current volume) |
| 26 Mar | Zoho data model | Supabase = WA state mirror only; Zoho = source of truth | Full lead replication to Supabase |
| 26 Mar | Contacts campaigns | Phase 3: CSV import to temp Supabase table | Zoho Contacts API integration |
| 26 Mar | Zoho writeback scope (Phase 1) | Core: opt-out + reply class + hotness | Minimal (opt-out only) or Full (incl. Zoho Tasks) |
| 26 Mar | re-engagement cron | Repurposed for Rules 5 & 6 (24h/48h follow-ups); 7-day dormancy cron deprecated | Keep 7-day cron, add new cron for follow-ups |
| 27 Mar | Analytics page tab architecture | URL-param-based (`?tab=`) server component tabs — shareable, no client state | Client-side useState (incompatible with Next.js 16 server components) |
| 27 Mar | Messages table backfill | Twilio message list API + `scripts/backfill-messages.ts` (idempotent) | Manual DB inserts; skip historical data |
| 27 Mar | Twilio URL reconstruction for signature validation | Rebuild from `x-forwarded-proto` + `x-forwarded-host` in serverless | Trust `req.url` (wrong in Vercel — internal hostname) |

---

## 🗂️ TEMPLATE REGISTRY (current, all 10)

| # | Name | SID | Type | Status | Trigger |
|---|---|---|---|---|---|
| 01 | `wa_welcome_meta_student` | `HXd032c7b2d23d59cd56bbc71453b0afd6` | Text, `{{1}}`=name | ✅ Approved | source=Meta, persona=Student |
| 02 | `wa_welcome_meta_parent` | `HXd97f088d39cd2f46bf189a3839eeb8ce` | Text, `{{1}}`=name | ✅ Approved | source=Meta, persona=Parent |
| 03 | `wa_welcome_organic_student` | `HX5f55c702e5b379893cf79f9a0f492e6e` | Text, `{{1}}`=name | ✅ Approved | source=Organic/Website, persona=Student |
| 04 | `wa_welcome_organic_parent` | `HXdad3576db7480fcf3e61c780221df990` | Text, `{{1}}`=name | ✅ Approved | source=Organic/Website, persona=Parent |
| 05 | `wa_welcome_manual` | `HX754c828d62941b79c72589...` | Text, `{{1}}`=name | ✅ Approved | source=Manual/Phone/Instagram/Referral |
| 06 | `wa_followup_1` | `HX9a5464b3d23fcc28453d5a3...` | Text, `{{1}}`=name | ✅ Approved | wa_state=first_sent, 24h no reply (Rule 5) |
| 07 | `wa_followup_2_quickreply` | `HX99c54dea1ea1d4fec682ee78452c0831` | Quick Reply (3 buttons) | ✅ Approved | wa_state=replied, 48h silence, track set (Rule 6b) |
| 08 | `wa_track_selector` | `HXddf8ea9d9d01a0cc51dc6419909abb20` | Quick Reply (3 buttons) | ✅ Approved | wa_state=replied, 48h silence, no track (Rule 6a) |
| 09 | `wa_webinar_cta` | `HXe5d3fdede430efb27b5e7c50bed1b55a` | Quick Reply (2 buttons) | ✅ Approved | Campaign only — parent segment |
| 10 | `wa_counsellor_intro` | `HX98acc8cb7caf053b138a8fd...` | Text, `{{1}}`=name | ✅ Approved | interested/fee_question reply or track selector tap |

**Sender:** `+917709333161` (WABA ID: `730962058295010`)
**Messaging Service SID:** `MG4b7040930f5d63bc27d808429106136a`
**Warmup limit:** 250/day (started 24 Mar 2026)

---

## 🔗 REFERENCE DOCS
- [`PRE_BUILD_SPECS.md`](./PRE_BUILD_SPECS.md) — Phone normalisation, reply taxonomy, architecture decisions
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history
- [`README.md`](./README.md) — Architecture overview, setup guide
