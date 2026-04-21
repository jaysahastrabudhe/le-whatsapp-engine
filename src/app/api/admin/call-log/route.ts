import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createZohoNote, updateZohoLead } from '@/lib/zoho';

export async function POST(request: Request) {
  try {
    const {
      leadId, zohoLeadId, caller, calledAt, contactStatus,
      notes, nextAction, nextActionDate, currentQueue,
      leadStage, leadStatus,
    } = await request.json();

    if (!leadId || !caller || !calledAt || !contactStatus || !nextAction) {
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
    const updateFields: Record<string, any> = {
      call_assigned_to: caller,
      updated_at: new Date().toISOString(),
      wa_human_response_due_at: null, // Any call counts as human response — clear WA SLA timer
    };

    if (contactStatus === 'no_answer') {
      if (currentQueue === 'whatsapp_reply') {
        updateFields.wa_state = 'call_queued';
      }
      // mql_outreach + no_answer: stays visible (lead_stage stays MQL, handled below)
    } else if (nextAction === 'followup_on_date') {
      updateFields.wa_state = currentQueue === 'discovery_call' ? 'discovery_call' : 'call_queued';
      updateFields.followup_call_at = nextActionDate;
    } else if (nextAction === 'discovery_call') {
      updateFields.wa_state = 'discovery_call';
      updateFields.followup_call_at = null;
    } else if (nextAction === 'ready_to_fill') {
      updateFields.wa_state = 'wa_sla_resolved';
      updateFields.followup_call_at = null;
    } else if (nextAction === 'close_lead') {
      updateFields.wa_state = 'wa_closed';
      updateFields.followup_call_at = null;
    }

    // Write CRM stage fields if provided
    if (leadStage)  updateFields.lead_stage  = leadStage;
    if (leadStatus) updateFields.lead_status = leadStatus;

    // Mark dirty for reconcile (WA fields only — Lead_Stage written directly below)
    updateFields.zoho_synced_at = null;

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateFields)
      .eq('id', leadId);

    if (updateError) throw updateError;

    // 3. Write to Zoho immediately (both note and field update)
    let zohoNoteOk = true;
    let zohoFieldsOk = true;

    if (zohoLeadId) {
      // 3a. Field writeback — Lead_Stage, Lead_Status (awaited)
      if (leadStage || leadStatus) {
        try {
          await updateZohoLead(zohoLeadId, {
            ...(leadStage  && { Lead_Stage:  leadStage }),
            ...(leadStatus && { Lead_Status: leadStatus }),
          });
        } catch (e: any) {
          console.error('[Call Log] Zoho field writeback failed:', e.message);
          zohoFieldsOk = false;
        }
      }

      // 3b. Note writeback (awaited)
      if (notes) {
        const title = `Call Log: ${contactStatus.replace(/_/g, ' ').toUpperCase()}`;
        let content = `Caller: ${caller}\nAction: ${nextAction.replace(/_/g, ' ').toUpperCase()}`;
        if (leadStage)  content += `\nLead Stage → ${leadStage}`;
        if (leadStatus) content += `\nLead Status → ${leadStatus}`;
        content += `\n\nNotes:\n${notes}`;
        if (nextActionDate) {
          content += `\n\nScheduled for: ${new Date(nextActionDate).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', hour12: true,
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}`;
        }
        try {
          await createZohoNote(zohoLeadId, title, content);
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
