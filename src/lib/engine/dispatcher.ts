import twilio from 'twilio';
import { config } from '../config';

// Initialize the Twilio client securely
const twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

export interface DispatchOptions {
  to: string; // The E.164 normalised number
  from: string; // The sender profile number
  body?: string; // Free-form message body (only valid within 24h session)
  contentSid?: string; // Twilio Content API template SID (replaces templates)
  contentVariables?: Record<string, string>; // Variables for Content API
  mediaUrl?: string[];
  leadId?: string; // Optional: Supabase lead UUID for recording
  templateName?: string; // Optional: Symbolic name of the template
  bypassCooldown?: boolean; // Campaign sends explicitly opt out of the 2-msg cooldown
}

import { getTwilioTemplateSid } from '../twilio/templates';
import { supabase } from '../supabase';

/**
 * Dispatches a WhatsApp message via Twilio API
 * Enforces a 2-message outbound cooldown limit relative to last inbound.
 * Returns the MessageInstance on success.
 */
export async function dispatchMessage(opts: DispatchOptions) {
  try {
    // Cooldown Enforcement Check — skipped for campaign sends (explicit broadcasts)
    if (!opts.bypassCooldown) {
      const { data: lead } = await supabase
        .from('leads')
        .select('wa_last_inbound_at')
        .eq('phone_normalised', opts.to)
        .single();

      // Count outbound messages since last inbound (or since epoch if null)
      const inDate = lead?.wa_last_inbound_at || new Date(0).toISOString();

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('phone_normalised', opts.to)
        .eq('direction', 'outbound')
        .gt('sent_at', inDate);

      if (count && count >= 2) {
        console.warn(`[Cooldown Enforcement] Dropping message to ${opts.to}. Exceeded 2 outbound messages without a reply.`);
        return null;
      }
    }
    const messageParams: any = {
      to: `whatsapp:${opts.to}`,
    };

    console.log('[Config] TWILIO_MESSAGING_SERVICE_SID:', config.TWILIO_MESSAGING_SERVICE_SID);

    // Use Messaging Service SID if available, otherwise fallback (which will likely fail 63027)
    if (config.TWILIO_MESSAGING_SERVICE_SID) {
      messageParams.messagingServiceSid = config.TWILIO_MESSAGING_SERVICE_SID;
    } else {
      console.warn('[Twilio] No MESSAGING_SERVICE_SID found in config. Falling back to from number.');
      messageParams.from = `whatsapp:${opts.from}`;
    }

    if (opts.body) {
      messageParams.body = opts.body;
    }

    if (opts.contentSid) {
      // If already a resolved HX SID, use directly. Otherwise resolve from name via Supabase/Twilio.
      if (opts.contentSid.startsWith('HX')) {
        messageParams.contentSid = opts.contentSid;
      } else {
        const resolvedSid = await getTwilioTemplateSid(opts.contentSid);
        if (!resolvedSid) {
          console.error(`[Dispatcher] Could not resolve ContentSid for template name "${opts.contentSid}". Skipping.`);
          return null;
        }
        messageParams.contentSid = resolvedSid;
      }
      // Always send contentVariables if using contentSid, with a fallback
      // Meta often rejects 63027 if a template expects variables and they are missing.
      messageParams.contentVariables = JSON.stringify(
        opts.contentVariables && Object.keys(opts.contentVariables).length > 0
          ? opts.contentVariables
          : { "1": "there" }
      );
    }

    console.log('[Twilio] messageParams:', JSON.stringify(messageParams, null, 2));

    // Resolve lead ID once — used in both success and failure paths
    let finalLeadId = opts.leadId;
    if (!finalLeadId) {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('id')
        .eq('phone_normalised', opts.to)
        .single();
      finalLeadId = leadRow?.id;
    }

    let message: Awaited<ReturnType<typeof twilioClient.messages.create>>;
    try {
      message = await twilioClient.messages.create(messageParams);
    } catch (err: any) {
      console.error(`[Dispatcher] Failed to dispatch message to ${opts.to}:`, {
        message: err.message,
        code: err.code,
        moreInfo: err.moreInfo,
        status: err.status,
      });
      // Record the failed attempt so it appears in analytics.
      // lead_id may be null for staged-contact campaign sends — that's fine, the
      // FK is nullable and phone_normalised keeps the row searchable.
      await supabase.from('messages').insert({
        lead_id:             finalLeadId ?? null,
        phone_normalised:    opts.to,
        direction:           'outbound',
        content:             null,
        status:              'failed',
        error_code:          String(err.code ?? err.status ?? 'unknown'),
        template_id:         opts.templateName,
        template_variant_id: messageParams.contentSid,
        sender_number:       opts.from || config.TWILIO_MESSAGING_SERVICE_SID || 'system',
        sent_at:             new Date().toISOString(),
      }).then(({ error: dbErr }) => {
        if (dbErr) console.warn('[Dispatcher] Could not record failed attempt:', dbErr.message);
      });
      throw err;
    }

    // 4. Record outbound message in Supabase (Immutable Log).
    // Always insert — even when finalLeadId is null (staged-contact campaign sends).
    // Without this row, the status webhook can't reconcile delivery state and
    // campaign reports show nothing.
    try {
      await supabase.from('messages').insert({
        lead_id:             finalLeadId ?? null,
        twilio_sid:          message.sid,
        phone_normalised:    opts.to,
        direction:           'outbound',
        content:             message.body,
        status:              'sent',
        template_id:         opts.templateName, // The symbolic name (e.g. wa_welcome_meta)
        template_variant_id: messageParams.contentSid, // The actual HX... SID
        sender_number:       opts.from || config.TWILIO_MESSAGING_SERVICE_SID || 'system',
        sent_at:             new Date().toISOString(),
      });

      // 5. Update lead's last-contact markers for analytics & state tracking.
      // Only when we have a lead — staged contacts don't exist in `leads` yet.
      if (finalLeadId) {
        await supabase
          .from('leads')
          .update({
            wa_last_outbound_at: new Date().toISOString(),
            wa_last_template:    opts.templateName || null,
            wa_last_twilio_sid:  message.sid,
            wa_last_status:      'sent',
            zoho_synced_at:      null,
          })
          .eq('id', finalLeadId);
      }
    } catch (saveErr) {
      console.warn('[Dispatcher] Failed to record outbound message or update lead in DB:', saveErr);
      // Don't throw, we've already sent the message
    }

    console.log(`[Dispatcher] Successfully queued message SID: ${message.sid} to ${opts.to}`);
    return message;
  } catch (err: any) {
    // Re-throw — already logged above in the Twilio failure path
    throw err;
  }
}
