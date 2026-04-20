import { supabase } from './src/lib/supabase';

async function main() {
  // Row counts
  const tables = ['leads', 'messages', 'lead_events', 'campaigns', 'campaign_leads', 'csv_imports', 'templates'];
  
  console.log("=== DATABASE STATUS ===\n");

  for (const table of tables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table.padEnd(20)} ${count} rows`);
  }

  // Lead state breakdown
  console.log("\n=== LEAD STATE BREAKDOWN ===\n");
  const { data: leads } = await supabase.from('leads').select('wa_state');
  const states: Record<string, number> = {};
  for (const l of leads || []) {
    const s = l.wa_state || 'null';
    states[s] = (states[s] || 0) + 1;
  }
  for (const [state, count] of Object.entries(states).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state.padEnd(25)} ${count}`);
  }

  // Recent messages last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentMessages } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .gt('sent_at', sevenDaysAgo);
  console.log(`\n  Messages in last 7 days: ${recentMessages}`);

  // Delivery rate
  const { count: delivered } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .eq('status', 'delivered');

  const { count: totalOutbound } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .neq('status', 'unrouted');

  console.log(`\n=== DELIVERY STATS ===\n`);
  console.log(`  Total outbound sent:  ${totalOutbound}`);
  console.log(`  Delivered:            ${delivered}`);
  console.log(`  Delivery rate:        ${totalOutbound ? Math.round((delivered! / totalOutbound) * 100) : 0}%`);

  // Hotness breakdown
  console.log("\n=== LEAD HOTNESS ===\n");
  const { data: hotness } = await supabase.from('leads').select('wa_hotness');
  const hmap: Record<string, number> = {};
  for (const l of hotness || []) {
    const h = l.wa_hotness || 'none';
    hmap[h] = (hmap[h] || 0) + 1;
  }
  for (const [h, c] of Object.entries(hmap).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${h.padEnd(20)} ${c}`);
  }
}

main().catch(console.error);
