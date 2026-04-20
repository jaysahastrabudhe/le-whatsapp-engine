import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createZohoNote } from '@/lib/zoho';

export async function POST(request: Request) {
  try {
    const { leadId, zohoLeadId, caller, calledAt, contactStatus, notes, nextAction, nextActionDate, currentQueue } = await request.json();

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
        next_action_date: nextActionDate || null
      });

    if (logError) throw logError;

    // 2. Update Lead State
    let updateFields: any = {
      call_assigned_to: caller,
      updated_at: new Date().toISOString(),
      wa_human_response_due_at: null // Clear WhatsApp SLA timer since call counts as human response
    };

    if (contactStatus === 'no_answer') {
      // Keep in same queue, but if it was just a whatsapp reply, convert it to a queued call so it is tracked correctly
      if (currentQueue === 'whatsapp_reply') {
        updateFields.wa_state = 'call_queued';
      }
    } else if (nextAction === 'followup_on_date') {
      // If it was already in discovery call queue, keep it there but add followup date.
      if (currentQueue === 'discovery_call') {
         updateFields.wa_state = 'discovery_call';
      } else {
         updateFields.wa_state = 'call_queued'; // Keep in call queued but it will be hidden until date
      }
      updateFields.followup_call_at = nextActionDate;
    } else if (nextAction === 'discovery_call') {
      updateFields.wa_state = 'discovery_call';
      updateFields.followup_call_at = null; // Clear if any
    } else if (nextAction === 'ready_to_fill') {
      updateFields.wa_state = 'wa_sla_resolved';
      updateFields.followup_call_at = null;
    }

    // Reset sync field so Zoho gets state update too (reconcile runs hourly)
    updateFields.zoho_synced_at = null;

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateFields)
      .eq('id', leadId);

    if (updateError) throw updateError;

    // 3. Write note to Zoho immediately
    if (zohoLeadId && notes) {
       let title = `Call Log: ${contactStatus.replace(/_/g, ' ').toUpperCase()}`;
       let content = `Caller: ${caller}\nAction: ${nextAction.replace(/_/g, ' ').toUpperCase()}\n\nNotes:\n${notes}`;
       if (nextActionDate) {
         content += `\n\nScheduled for: ${new Date(nextActionDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
       }
       // Don't await in main request thread to make UI snappy
       createZohoNote(zohoLeadId, title, content).catch(e => console.error(e));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Call Log] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
