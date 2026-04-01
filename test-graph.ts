import { supabase } from './src/lib/supabase';
import { evaluateWorkflowGraph } from './src/lib/engine/logicEvaluator';
import { Lead } from './src/lib/supabase';

async function main() {
  const { data: workflow } = await supabase.from('workflow_rules').select('*').single();
  const nodes = workflow.conditions_json;
  const edges = workflow.actions_json;
  
  console.log(`Loaded ${nodes.length} nodes and ${edges.length} edges`);
  
  const { data: lead } = await supabase.from('leads').select('*').eq('phone_normalised', '+917602153093').single();
  console.log(`Lead ${lead.name} details: source=${lead.lead_source}, program=${lead.program}, persona=${lead.persona}, urgency=${lead.urgency}, relocate=${lead.relocate_to_pune}`);
  
  const action = evaluateWorkflowGraph('wa_pending', lead as Lead, nodes, edges);
  console.log("Evaluation Result:", action);
}
main().catch(console.error);
