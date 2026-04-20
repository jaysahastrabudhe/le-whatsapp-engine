import { supabase } from './src/lib/supabase';
import { evaluateLeadAction } from './src/lib/engine/rulesEngine';
import { Lead } from './src/lib/supabase';

async function main() {
  const phones = [
    '+919507813020', '+919072151087', '+918113874081', 
    '+917701904514', '+918260190793', '+917602153093'
  ];

  // 1. Delete all fake 'unrouted' messages so cooldown (count >= 2) doesn't drop the real message
  const { error: delErr } = await supabase
    .from('messages')
    .delete()
    .in('phone_normalised', phones)
    .eq('status', 'unrouted');
    
  if (delErr) {
    console.error("Failed to delete unrouted:", delErr);
    return;
  }
  console.log("Cleaned up fake 'unrouted' messages that were triggering the cooldown.");

  // 2. Fetch the leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .in('phone_normalised', phones);

  // 3. Reset state & Re-evaluate locally
  for (const lead of leads || []) {
    try {
      // Reset DB to pending, but critically ALSO clear wa_last_outbound_at so rulesEngine doesn't skip
      await supabase
        .from('leads')
        .update({ 
          wa_state: 'wa_pending', 
          wa_last_outbound_at: null, // Critical! Otherwise it's marked 'already_contacted'
          updated_at: new Date().toISOString() 
        })
        .eq('id', lead.id);

      // In-memory update
      const updatedLead = { ...lead, wa_state: 'wa_pending', wa_last_outbound_at: null };

      // Queue the message
      await evaluateLeadAction(updatedLead as Lead, 'manual_retry');
      console.log(`Successfully re-queued ${lead.name}`);
    } catch (e: any) {
      console.error(`Failed ${lead.name}:`, e.message);
    }
  }
}

main().catch(console.error);
