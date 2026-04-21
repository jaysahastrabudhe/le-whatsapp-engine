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
| 5 | Work through the **Pending Outreach** queue — log each call. Selecting "Set up discovery call" promotes the lead and clears the SLA timer. | Routinely | Jonathan |
| 6 | Conduct **Discovery Calls** from the Discovery Queue. Once sold, log the call and mark as "Ready to Fill Form" to clear from the board. | Routinely | Gargi |
| 7 | Review **Scheduled Callbacks** — check who is due today and confirm or reschedule. | End of day | Jonathan |
| 8 | Review [Template Performance](/admin/analytics?tab=performance) — check delivery %, reply %, and top errors. Pause or replace under-performing templates. Also review Campaign results. | Weekly | — |

---

## MQL Outreach

The **MQL Outreach** box shows leads in Zoho's MQL stage that haven't been contacted, disqualified, or marked as junk. These are warm inbound leads that need a first call.

- Synced from Zoho daily via the MQL Sync cron (`/api/cron/mql-sync`)
- Excluded statuses: Contacted, Junk Lead, Lost Lead, Not Qualified
- Log a call using the amber "Log Call" button — selecting "Set up discovery call" moves them into the main call queue

## Notes

- The 24h customer service window (free-form replies) resets on every inbound message from the lead
- Logging any call clears the WhatsApp SLA timer for that lead
- Leads marked "Remove from SLA" move to `wa_closed` state and disappear from all queues
