# LE WhatsApp Automation Engine

**Production-ready WhatsApp lead engagement engine** connecting Zoho CRM ↔ Twilio WhatsApp ↔ Supabase, with automated message classification, SLA tracking, campaign management, a visual Logic Builder, and a full source×persona routing rule set.

**Live URL:** [https://le-whatsapp-engine.vercel.app/admin](https://le-whatsapp-engine.vercel.app/admin)
**Version:** 3.9.0 | **Status:** ✅ Phase 1–3.9 Complete — Engine live, SLA escalation to Zoho live, manual contact flow, follow-up logic configurable from admin UI.

---

## Architecture Overview

```
Zoho CRM ──webhook──► /api/webhooks/zoho
                            │
                    Normalise Phone
                    Upsert Supabase (with program, persona,
                    academic_level, relocate_to_pune, urgency)
                    Compute Urgency (Rule 3)
                            │
                    ┌───────┴────────────────────────────┐
                    │      Logic Builder Graph           │
                    │  (workflow_rules table — editable) │
                    │                                    │
                    │  Rule 1: Program filter            │
                    │  Rule 2: Relocation filter         │
                    │  Rule 3: Urgency filter            │
                    │  Rule 4: Source × Persona routing  │
                    └───────────────────────────────────-┘
                            │
                    Enqueue to Upstash Redis
                    (wa_state → 'first_sent')
                            │
                    cron-job.org (1 min)
                            │
                    /api/cron/process-queue
                            │
              ┌─────────────┼──────────────────┐
              │             │                  │
         Inbound        Outbound           Status
         Classify       Dispatch           Update
         Reply          via Twilio         Supabase
              │
    ButtonPayload? ──► BUTTON MAP
    Free text? ──────► NLP Classifier (DB keyword rules)
              │
    Post-classification:
    interested/fee_question → wa_counsellor_intro + 2h SLA
    not_now → wa_nurture
    stop → wa_opt_in=false (immediate)
    track tap → lead_track + wa_counsellor_intro
              │
    Zoho writeback (Phase 1: reply_class, hotness, opt_in)
              │
        Lead's WhatsApp
```

### Follow-up Sweeps (daily, 11:30 AM via cron-job.org)
```
/api/cron/reengagement
    │
    ├── Rule 5: wa_state=first_sent + 24h no reply
    │          → send wa_followup_1 (hard stop — max 2 outbound before reply)
    │
    ├── Rule 6a: wa_state=replied + 48h silence + lead_track IS NULL
    │           → send wa_track_selector (3-button quick reply)
    │
    └── Rule 6b: wa_state=replied + 48h silence + lead_track IS NOT NULL
                → send wa_followup_2_quickreply (3-button quick reply)
```

---

## Core Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Serverless on Vercel Hobby |
| Database | Supabase (Postgres) | WA state mirror; Zoho = source of truth |
| Queue / Cache | Upstash Redis (REST — `rpush`/`lpop`) | Serverless-compatible; no raw TCP |
| Messaging | Twilio WhatsApp Business API | Content API, all templates via HX… SIDs |
| CRM | Zoho CRM | Inbound webhook + writeback (Phase 1 in progress) |
| Hosting | Vercel (Serverless, Hobby plan) | CLI deploy: `vercel --prod --yes` |
| Cron Scheduling | cron-job.org (free tier) | Per-minute execution beyond Vercel Hobby limits |
| Rules Engine | React Flow graph evaluator (`logicEvaluator.ts`) | Graph-first; code fallback for Rules 1–4 |

---

## Admin UI Modules

| Page | URL | Description |
|---|---|---|
| **Control Hub** | `/admin` | Central dashboard — 8-card grid linking all tools |
| **Logic Builder** | `/admin/logic-builder` | Visual drag-and-drop FSM editor (React Flow). Loads saved graph from DB on open. |
| **SLA Monitor** | `/admin/sla-monitor` | Active/Escalated SLA tracker. Breached leads trigger Zoho Task creation. Resolve button per row. |
| **Campaign Manager** | `/admin/campaigns` | Manage bulk WhatsApp campaigns with per-campaign funnel stats and "View details" link |
| **Campaign Detail** | `/admin/campaigns/[id]` | Full delivery funnel (Targeted→Sent→Delivered→Read→Replied→Failed) + respondents table |
| **Create Campaign** | `/admin/campaigns/create` | Template dropdown (from Supabase), segment filters, launches with jitter queue |
| **Reply Classification** | `/admin/classification` | Edit keywords per reply class — no deploy needed |
| **Template Analytics** | `/admin/analytics?tab=performance` | Per-template delivery %, reply %, top error codes |
| **Message Log** | `/admin/analytics?tab=messages` | Full inbound/outbound log with hotness badge, 24h window pulse, Reply + Mark Manual buttons |
| **WhatsApp Templates** | `/admin/templates` | Live Twilio template list with approval status and manual Refresh |
| **Follow-up Logic** | `/admin/followup-config` | Configure Rule 5 and Rule 6 timing, templates, and enabled state — no deploy needed |
| **Zoho Field Mapping** | `/admin/zoho-mapping` | Internal key ↔ Zoho merge tag reference table + recommended JSON for Zoho webhook setup |

---

## Rules Engine v3

Rules are stored in the `workflow_rules` table as a React Flow graph and evaluated at runtime. The Logic Builder UI at `/admin/logic-builder` lets you edit and republish the graph without a deploy.

### Automated Rules (seeded graph — editable in Logic Builder)

| Rule | Condition | Action |
|---|---|---|
| **1 — Program filter** | `program = Storysells` | Route to `wa_welcome_manual` (placeholder) |
| **1 — Program pass** | `program = BBA Pune` or empty | Continue |
| **2 — Relocation filter** | `relocate_to_pune = No` | `wa_manual_triage` — no WA message |
| **2 — Relocation pass** | `relocate_to_pune = Yes` or empty | Continue |
| **3 — Urgency LOW** | `academic_level = 10th` (or below) | Skip WA sequence entirely |
| **3 — Urgency pass** | 11th → MEDIUM, 12th/Graduate → HIGH | Continue |
| **4 — Meta × Student** | `lead_source ∋ Meta` AND `persona = Student` | Send `wa_welcome_meta_student` |
| **4 — Meta × Parent** | `lead_source ∋ Meta` AND `persona = Parent` | Send `wa_welcome_meta_parent` |
| **4 — Organic × Student** | `lead_source ∋ Organic/Website` AND `persona = Student` | Send `wa_welcome_organic_student` |
| **4 — Organic × Parent** | `lead_source ∋ Organic/Website` AND `persona = Parent` | Send `wa_welcome_organic_parent` |
| **4 — Manual** | All other sources | Send `wa_welcome_manual` |

### Time-Based Rules (cron code — not in graph)

| Rule | Trigger | Action |
|---|---|---|
| **5 — 24h no reply** | `wa_state=first_sent`, 24h elapsed, no inbound | Send `wa_followup_1`. Hard stop — max 2 outbound before any reply. |
| **6a — 48h silence, no track** | `wa_state=replied`, 48h elapsed, `lead_track=NULL` | Send `wa_track_selector` (3-button quick reply) |
| **6b — 48h silence, track set** | `wa_state=replied`, 48h elapsed, `lead_track≠NULL` | Send `wa_followup_2_quickreply` (3-button quick reply) |

### Inbound Classification (Rule 8)

ButtonPayload taps are detected first. Free text falls through to NLP classifier.

**Button postback map:**

| Payload | Class | State | Special |
|---|---|---|---|
| `INTERESTED` | interested | wa_hot | — |
| `MORE_INFO` | other | wa_hot | — |
| `DECIDED_AGAINST` | not_now | wa_closed | — |
| `ENTERPRISE_LEADERSHIP` | interested | wa_hot | `lead_track = enterprise_leadership` |
| `FAMILY_BUSINESS` | interested | wa_hot | `lead_track = family_business` |
| `VENTURE_BUILDER` | interested | wa_hot | `lead_track = venture_builder` |
| `WEBINAR_YES` | interested | wa_hot | `webinar_rsvp = true`, flag counsellor manually |
| `WEBINAR_NO` | not_now | wa_nurture | `webinar_rsvp = false` |

**NLP classifier classes (DB-driven, editable at `/admin/classification`):**

| Class | Hotness | State | Action |
|---|---|---|---|
| `interested` | hot | wa_hot | Send `wa_counsellor_intro` + 2h SLA |
| `fee_question` | warm | wa_hot | Send `wa_counsellor_intro` + 2h SLA |
| `not_now` | cold | wa_nurture | Pause outbound |
| `wrong_number` | dead | wa_closed | Halt all sends |
| `stop` | dead | wa_closed | `wa_opt_in = false` immediately |
| `other` | warm | replied | Flag for human review |

---

## Template Suite (all 10)

| # | Name | SID | Status | Trigger |
|---|---|---|---|---|
| 01 | `wa_welcome_meta_student` | `HXd032c7b2d23d59cd56bbc71453b0afd6` | ✅ Approved | Meta × Student |
| 02 | `wa_welcome_meta_parent` | `HXd97f088d39cd2f46bf189a3839eeb8ce` | ✅ Approved | Meta × Parent |
| 03 | `wa_welcome_organic_student` | `HX5f55c702e5b379893cf79f9a0f492e6e` | ✅ Approved | Organic/Website × Student |
| 04 | `wa_welcome_organic_parent` | `HXdad3576db7480fcf3e61c780221df990` | ✅ Approved | Organic/Website × Parent |
| 05 | `wa_welcome_manual` | `HX754c828d62941b79c72589...` | ✅ Approved | Manual/Phone/Instagram/Referral |
| 06 | `wa_followup_1` | `HX9a5464b3d23fcc28453d5a3...` | ✅ Approved | 24h no-reply (Rule 5) |
| 07 | `wa_followup_2_quickreply` | `HX99c54dea1ea1d4fec682ee78452c0831` | ✅ Approved | 48h post-reply, track set (Rule 6b) |
| 08 | `wa_track_selector` | `HXddf8ea9d9d01a0cc51dc6419909abb20` | ✅ Approved | 48h post-reply, no track (Rule 6a) |
| 09 | `wa_webinar_cta` | `HXe5d3fdede430efb27b5e7c50bed1b55a` | ✅ Approved | Campaign only — parent segment |
| 10 | `wa_counsellor_intro` | `HX98acc8cb7caf053b138a8fd...` | ✅ Approved | interested/fee_question/track tap |

**Sender:** `+917709333161` | **WABA:** `730962058295010` | **Messaging Service:** `MG4b7040930f5d63bc27d808429106136a`

---

## API Endpoints

### Webhooks (Inbound)
| Endpoint | Method | Source | Auth |
|---|---|---|---|
| `/api/webhooks/zoho` | POST | Zoho CRM Workflow Rules | HMAC SHA256 (`x-zoho-signature`) |
| `/api/webhooks/twilio/inbound` | POST | Twilio (WhatsApp reply received) | `x-twilio-signature` |
| `/api/webhooks/twilio/status` | POST | Twilio (delivery status callback) | `x-twilio-signature` |

### Cron Jobs (Called by cron-job.org)
| Endpoint | Method | Schedule | Purpose |
|---|---|---|---|
| `/api/cron/process-queue` | GET | Every 1 min | Drain Redis queue — inbound classify, outbound dispatch, status update |
| `/api/cron/sla-monitor` | GET/POST | Every 5 min | Escalate leads past `wa_human_response_due_at` |
| `/api/cron/zoho-reconcile` | GET/POST | Every 60 min | Batch-sync missed WA state writebacks to Zoho |
| `/api/cron/reengagement` | GET | Daily 11:30 AM | Rules 5 & 6 follow-up sweep (24h no-reply + 48h post-reply) |

### Admin API
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/workflow` | GET | Load published Logic Builder graph from `workflow_rules` |
| `/api/admin/workflow` | POST | Save/publish Logic Builder graph to `workflow_rules` |
| `/api/admin/templates` | GET | List Twilio templates (persistent Redis cache; no TTL) |
| `/api/admin/templates/refresh` | POST | Bust Twilio template cache and reload |
| `/api/admin/settings` | GET | Read a `system_settings` key (e.g. `engine_enabled`) |
| `/api/admin/settings` | POST | Write a `system_settings` key |
| `/api/admin/send-reply` | POST | Send a free-form WhatsApp reply within the 24h customer service window |
| `/api/admin/mark-manual` | POST | Mark a failed lead as manually contacted from phone — blocks engine re-send |
| `/api/admin/sla-resolve` | POST | Mark an SLA lead as resolved by counsellor |
| `/api/admin/followup-config` | GET | Read current follow-up rule configuration |
| `/api/admin/followup-config` | POST | Save follow-up rule configuration |

---

## Environment Variables

All secrets stored in **Vercel → Project Settings → Environment Variables**.

| Variable | Source | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API | Supabase project REST endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | Server-side DB access (bypasses RLS) |
| `UPSTASH_REDIS_REST_URL` | Upstash Console → Redis Database | Redis REST endpoint for queue |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → Redis Database | Auth token for Upstash REST |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info | Twilio API auth + webhook signature validation |
| `TWILIO_WEBHOOK_SECRET` | Same as `TWILIO_AUTH_TOKEN` (optional override) | Validates `x-twilio-signature` on inbound webhooks |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio Console → Messaging → Services | **Required** for Content API template sends. Value: `MG4b7040930f5d63bc27d808429106136a` |
| `ZOHO_WEBHOOK_SECRET` | Webhook HMAC secret | HMAC SHA256 validation of Zoho webhook payloads |
| `ZOHO_CLIENT_ID` | Zoho OAuth Self-Client | Zoho CRM writeback authentication |
| `ZOHO_CLIENT_SECRET` | Zoho OAuth Self-Client | Zoho CRM writeback authentication |
| `ZOHO_REFRESH_TOKEN` | Zoho OAuth Self-Client | Long-lived token for access token refresh |

| `CRON_SECRET` | User-defined | `Authorization: Bearer <secret>` for all cron endpoints |
| `NODE_ENV` | Auto-set by Vercel | `production` / `development` |

---

## External Service Configuration

### Twilio
- **WhatsApp sender:** `+917709333161`
- **Inbound Webhook URL:** `https://le-whatsapp-engine.vercel.app/api/webhooks/twilio/inbound`
- **Status Callback URL:** `https://le-whatsapp-engine.vercel.app/api/webhooks/twilio/status`
- **Method:** HTTP POST (both)
- **Messaging Service SID:** `MG4b7040930f5d63bc27d808429106136a` — required for all Content API sends
- **Geo Permissions:** India (`+91`) must be checked under Console → Geo Permissions
- **Template discovery:** Live from `https://content.twilio.com/v1/Content` (persistent Redis cache — no TTL). Hit Refresh in `/admin/templates` after any template changes.
- **Warmup:** Started 24 Mar 2026. Current limit: 250 conversations/day.

### Zoho CRM
- Workflow Rules on Leads module POST to `/api/webhooks/zoho`
- Include `x-zoho-signature` header (HMAC SHA256 of body with shared secret)
- **Fields to send:** `zoho_lead_id`, `phone`, `name`, `email`, `lead_source`, `campaign_name`, `owner_email`, `program`, `persona`, `academic_level`, `relocate_to_pune`
- **Zoho custom fields required:** `WA_Opt_In`, `WA_State`, `WA_Hotness`, `WA_Reply_Class`, `WA_Last_Inbound_At`, `WA_Track`
- **Writeback:** Core fields written after inbound processing (Phase 1). Full writeback + Zoho Tasks in Phase 2.

### cron-job.org
- 4 cron jobs configured (see table above)
- Each sends `Authorization: Bearer <CRON_SECRET>` header
- Process queue: every 1 min | SLA monitor: every 5 min | Reengagement: daily 11:30 AM | Zoho reconcile: every 60 min

---

## Database Schema (Supabase)

| Table | Purpose |
|---|---|
| `leads` | WA state mirror of Zoho leads. Source of truth for routing and classification. |
| `messages` | Immutable log of every inbound/outbound WhatsApp message |
| `lead_events` | Append-only audit trail (button taps, reply classifications, state transitions) |
| `sender_profiles` | WhatsApp sender numbers + warmup tracking |
| `workflow_rules` | Logic Builder graph (React Flow JSON: `conditions_json`=nodes, `actions_json`=edges) |
| `campaigns` | Campaign definitions (name, template, segment, scheduled time) |
| `campaign_leads` | Per-lead tracking within each campaign (sent/delivered/replied/failed) |
| `classification_rules` | Keyword rules per reply class — editable from `/admin/classification` |
| `followup_config` | Single-row config for follow-up rule timing, templates, and enabled flags |

### `leads` table — key columns

| Column | Type | Description |
|---|---|---|
| `phone_normalised` | TEXT (PK-unique) | E.164 format, e.g. `+919876543210` |
| `lead_source` | TEXT | From Zoho (Meta Ads, Organic, Website, Manual, etc.) |
| `program` | TEXT | BBA Pune, Storysells, etc. |
| `persona` | TEXT | Student or Parent |
| `academic_level` | TEXT | 12th / 11th / 10th / Graduate / Already in college |
| `relocate_to_pune` | TEXT | Yes / No |
| `urgency` | TEXT | HIGH / MEDIUM / LOW — computed at intake |
| `lead_track` | TEXT | enterprise_leadership / family_business / venture_builder |
| `webinar_rsvp` | BOOLEAN | true=RSVP'd / false=declined / NULL=not asked |
| `wa_state` | TEXT | Current state in WA sequence (see state machine below) |
| `wa_opt_in` | BOOLEAN | False = absolute halt on all sends |
| `wa_hotness` | TEXT | hot / warm / cold / dead |
| `wa_reply_class` | TEXT | Latest classification of inbound reply |
| `wa_last_outbound_at` | TIMESTAMPTZ | Last outbound message time |
| `wa_last_inbound_at` | TIMESTAMPTZ | Last inbound message time |
| `wa_human_response_due_at` | TIMESTAMPTZ | SLA deadline for counsellor response |

### `wa_state` lifecycle

```
wa_pending → first_sent → replied → wa_hot → [counsellor handles]
                       ↘ followup_sent (24h no reply)
                                  ↘ [no further reply → cold, captured by campaigns]
             wa_manual_triage (filtered: Storysells / no relocate / low urgency)
             wa_manual (admin marked as manually contacted from phone)
             wa_nurture (not_now reply)
             wa_closed (stop / wrong_number / DECIDED_AGAINST)
             wa_unrouted (graph returned no_match — visible in analytics as null pill)
             wa_sla_escalated (SLA breached — Zoho task created, awaiting counsellor)
             wa_sla_resolved (counsellor marked as handled)
```

### Migrations
- `supabase/migrations/20260323_init_schema.sql` — core tables
- `supabase/migrations/20260324_campaign_tracking.sql` — campaigns, campaign_leads
- `supabase/migrations/20260325_classification_rules.sql` — classification_rules + seed keywords
- `supabase/migrations/20260326_new_lead_fields.sql` — program, persona, academic_level, relocate_to_pune, urgency, lead_track, webinar_rsvp
- `supabase/migrations/20260326_seed_workflow.sql` — Rules 1–4 decision graph seeded into workflow_rules
- `supabase/migrations/20260327_system_settings.sql` — `system_settings` table for global engine configuration (Kill Switch)
- `supabase/migrations/20260327_messages_error_code.sql` — adds `error_code` and `phone_normalised` columns to `messages` table; adds performance indexes

---

## Zoho Writeback

| Trigger | Fields written | Phase |
|---|---|---|
| Inbound reply classified | `WA_Reply_Class`, `WA_Hotness`, `WA_Last_Inbound_At` | Phase 1 |
| Opt-out (`stop`) | `WA_Opt_In = false` (immediate) | Phase 1 |
| Track selector tap | `WA_Track` picklist | Phase 1 ✅ |
| Outbound send | `WA_State`, `WA_Last_Outbound_At`, `WA_Last_Template` | Phase 2 |
| SLA breach (hot/warm lead) | Create Zoho Task: High priority, linked to lead, due today | Phase 1 ✅ |

---

## Send Rules

- **Time window:** 9 AM – 8 PM IST only
- **Cooldown:** Max 2 outbound templates before any inbound reply (enforced in `dispatcher.ts`)
- **Opt-out:** `wa_opt_in = false` → absolute halt, no sends regardless of state
- **Campaign rate limit:** ~10/min (random batch 8–14, shuffled, 200–600ms jitter between sends — avoids bulk detection by Meta)
- **24h customer service window:** Free-form replies allowed within 24h of a lead's last inbound message. Pulse indicator shown in Message Log; Reply button opens a modal to send directly from the admin.

---

## Development

```bash
npm install
npm run dev       # Local dev server at http://localhost:3000
npm run lint      # ESLint
npm run build     # Production build
```

Deploy to production:
```bash
vercel --prod --yes
```

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Complete | Rules Engine v3, Zoho integration, all 10 templates approved, E2E delivery confirmed 27 Mar 2026 |
| Phase 2 | ✅ Complete | Global Kill Switch, Zoho Field Mapping page, persistent template cache, dispatcher safety layer |
| Phase 3.3 | ✅ Complete | Analytics 2-tab rewrite, messages table migration, dispatcher + inbound bug fixes, Twilio console config, backfill script, full E2E confirmed |
| Phase 3.4 | ✅ Complete | Supabase templates table, single source of truth for SIDs, constants stripped |
| Phase 3.5 | ✅ Complete | lead_source field name fix, cooldown sent_at fix, dispatcher double-SID fix |
| Phase 3.6 | ✅ Complete | Campaign manager overhaul: template dropdown, contentVariables, jitter, campaign_leads tracking, detail page + respondents |
| Phase 3.7 | ✅ Complete | 24h reply window pulse indicator + free-form reply button in Message Log |
| Phase 3.8 | ✅ Complete | Routing audit log, graph hardening (cycle guard, urgency fix, persona fix), hardcoded fallback removed |
| Phase 3.9 | ✅ Complete | SLA escalation to Zoho Tasks, manual contact flow, SLA Monitor UI overhaul, admin Control Hub cards, Message Log hotness column, follow-up logic config UI |
| Phase 3 (next) | ⚪ Planned | Cron deduplication, named flow saves, editable button map, expanded Zoho writeback |
| Phase 4 | ⚪ Future | Multiple flows, end node differentiation, CSV contacts campaigns |

---

## Reference Docs
- [`PRE_BUILD_SPECS.md`](./PRE_BUILD_SPECS.md) — Phone normalisation, reply taxonomy, architecture decisions
- [`PROJECT_EXECUTION.md`](./PROJECT_EXECUTION.md) — Full execution tracker with all tasks, blockers, and decisions
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history
