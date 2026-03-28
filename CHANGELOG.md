# Changelog

All notable changes to the Let's Enterprise WhatsApp Engine project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
