import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createZohoNote, updateZohoLead } from '@/lib/zoho';
import { positiveCallTarget, waStateForStage, WA_COLD, WA_JUNK, NO_ANSWER_LIMIT } from '@/lib/funnel';

export async function POST(request: Request) {
  try {
    const {
      leadId, zohoLeadId, caller, calledAt, contactStatus,
      notes, nextAction, nextActionDate, currentQueue,
      leadStage, leadStatus, channel,
      // Funnel-driven routing (preferred): outcome = positive | negative | no_answer | call_back_later
      outcome, currentStage, noAnswerCount,
    } = await request.json();
    const isMessage = channel === 'message';
    const nowIso = new Date().toISOString();

    if (!leadId || !caller || !calledAt || !contactStatus || (!nextAction && !outcome)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Insert Call Log
    const { error: logError } = await supabase
      .from('call_logs')
      .insert({
        lead_id: leadId,
        caller,
        called_at: calledAt,
        contact_status: contactStatus,
        notes,
        next_action: nextAction,
        next_action_date: nextActionDate || null,
      });

    if (logError) throw logError;

    // 2. Update Lead State in Supabase
    // nextAction always drives the state transition; contactStatus is only for the call_log record.
    const updateFields: Record<string, any> = {
      call_assigned_to: caller,
      // Do NOT touch updated_at for no_answer — it would reshuffle queue position.
      // updated_at is only set for meaningful state transitions below.
      wa_human_response_due_at: null, // Any call counts as human response — clear WA SLA timer
    };

    if (outcome) {
      // ── Funnel-driven routing (Positive / Negative / No-answer / Call-back) ──
      if (outcome === 'negative') {
        // Negative at ANY touchpoint → Junk (disqualified).
        updateFields.wa_state = WA_JUNK;
        updateFields.lead_status = 'Junk Lead';
        updateFields.followup_call_at = null;
        updateFields.updated_at = nowIso;
      } else if (outcome === 'positive') {
        if (isMessage) {
          // MQL message positive → unlock Sharjeel's call; record-only, stays in box.
        } else {
          // Positive call advances the funnel: MQL/MQL+/MQL++ → MQL+++, MQL+++ → SQL.
          const target = positiveCallTarget(currentStage);
          updateFields.lead_stage = target;
          const wa = waStateForStage(target);
          if (wa) updateFields.wa_state = wa;
          updateFields.followup_call_at = null;
          if (target === 'SQL') updateFields.lead_status = 'Contacted';
          updateFields.updated_at = nowIso;
        }
      } else if (outcome === 'call_back_later') {
        updateFields.wa_state = currentStage === 'MQL+++' ? 'discovery_call' : 'call_follow_up';
        updateFields.followup_call_at = nextActionDate;
        updateFields.updated_at = nowIso;
      } else {
        // no_answer. Only unanswered CALLS count toward the ×3 → Cold limit; an unanswered
        // message is a record-only touch (the row above is logged as 'message_no_reply').
        if (!isMessage) {
          // Recount consecutive no-answers from the DB (client noAnswerCount can be stale
          // under concurrent operators). The current log row is already inserted above.
          const { data: recent } = await supabase
            .from('call_logs')
            .select('contact_status')
            .eq('lead_id', leadId)
            .order('called_at', { ascending: false })
            .limit(20);
          let consecutive = 0;
          for (const r of recent ?? []) {
            if (['answered', 'call_back_later', 'message_sent', 'negative'].includes(r.contact_status)) break;
            if (r.contact_status === 'no_answer') consecutive++;
          }
          if (consecutive >= NO_ANSWER_LIMIT) {
            updateFields.wa_state = WA_COLD;
            updateFields.lead_status = 'Cold';
            updateFields.followup_call_at = null;
            updateFields.updated_at = nowIso;
          }
          // else: leave in place, do not bump updated_at (preserve queue position)
        }
      }
    } else if (nextAction === 'close_lead') {
      updateFields.wa_state = 'wa_closed';
      updateFields.followup_call_at = null;
      updateFields.updated_at = nowIso;
    } else if (nextAction === 'discovery_call') {
      updateFields.wa_state = 'discovery_call';
      updateFields.followup_call_at = null;
      updateFields.updated_at = nowIso;
    } else if (nextAction === 'ready_to_fill') {
      updateFields.wa_state = 'wa_sla_resolved';
      updateFields.followup_call_at = null;
      updateFields.updated_at = nowIso;
    } else if (nextAction === 'followup_on_date') {
      // Schedule a specific retry date — lead hides until that date
      updateFields.wa_state = currentQueue === 'discovery_call' ? 'discovery_call' : 'call_follow_up';
      updateFields.followup_call_at = nextActionDate;
      updateFields.updated_at = nowIso;
    } else {
      // no_answer / message-keep — queue position must not change, so updated_at is
      // intentionally NOT set here. A *call* no-answer on a whatsapp_reply lead promotes
      // it to the call queue; a *message* touch is record-only and must leave the lead in
      // its current box (do not promote, do not change state).
      if (currentQueue === 'whatsapp_reply' && !isMessage) {
        updateFields.wa_state = 'call_queued';
        updateFields.followup_call_at = null;
        updateFields.wa_human_response_due_at = null;
      }
    }

    // Legacy explicit CRM fields (only when not outcome-driven — outcome sets them above)
    if (!outcome && leadStage)  updateFields.lead_stage  = leadStage;
    if (!outcome && leadStatus) updateFields.lead_status = leadStatus;

    // Mark dirty for reconcile (WA fields only — Lead_Stage written directly below)
    updateFields.zoho_synced_at = null;

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateFields)
      .eq('id', leadId);

    if (updateError) throw updateError;

    // 2b. Append a date-accurate funnel-transition audit event so the Daily Funnel Report
    // can count outcomes/stage moves exactly by created_at (instead of the imprecise
    // leads.updated_at). Best-effort — never block the call log on this.
    if (outcome) {
      await supabase.from('lead_events').insert({
        lead_id: leadId,
        event_type: 'funnel_transition',
        payload: {
          caller,
          outcome,
          channel: isMessage ? 'message' : 'call',
          from_stage: currentStage ?? null,
          to_stage: updateFields.lead_stage ?? null,
          to_wa_state: updateFields.wa_state ?? null,
        },
      }).then(({ error }) => { if (error) console.warn('[Call Log] audit event failed:', error.message); });
    }

    // 3. Write to Zoho immediately (both note and field update)
    let zohoNoteOk = true;
    let zohoFieldsOk = true;

    // Skip Zoho writeback for Contacts module leads — they don't exist in Zoho Leads
    const { data: leadRow } = await supabase.from('leads').select('zoho_module').eq('id', leadId).single();
    const isContactsModule = leadRow?.zoho_module === 'contacts';

    // Effective CRM fields = whatever we actually wrote to the lead (funnel routing or legacy).
    const effStage  = updateFields.lead_stage  ?? leadStage;
    const effStatus = updateFields.lead_status ?? leadStatus;

    if (zohoLeadId && !isContactsModule) {
      // 3a. Field writeback — Lead_Stage, Lead_Status (awaited)
      if (effStage || effStatus) {
        zohoFieldsOk = await updateZohoLead(zohoLeadId, {
          ...(effStage  && { Lead_Stage:  effStage }),
          ...(effStatus && { Lead_Status: effStatus }),
        });
      }

      // 3b. Note writeback (awaited)
      if (notes) {
        const title = isMessage
          ? `Message Log: ${caller}`
          : `Call Log: ${contactStatus.replace(/_/g, ' ').toUpperCase()}`;
        const actionLabel = (outcome || nextAction || '').replace(/_/g, ' ').toUpperCase();
        let content = `Caller: ${caller}\nOutcome: ${actionLabel}`;
        if (effStage)  content += `\nLead Stage → ${effStage}`;
        if (effStatus) content += `\nLead Status → ${effStatus}`;
        content += `\n\nNotes:\n${notes}`;
        if (nextActionDate) {
          content += `\n\nScheduled for: ${new Date(nextActionDate).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', hour12: true,
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}`;
        }
        try {
          zohoNoteOk = await createZohoNote(zohoLeadId, title, content);
        } catch (e: any) {
          console.error('[Call Log] Zoho note creation failed:', e.message);
          zohoNoteOk = false;
        }
      }
    }

    return NextResponse.json({
      success: true,
      zoho: { fieldsWritten: zohoFieldsOk, noteCreated: zohoNoteOk },
    });
  } catch (error: any) {
    console.error('[Call Log] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
