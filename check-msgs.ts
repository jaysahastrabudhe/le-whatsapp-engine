import { supabase } from './src/lib/supabase';

async function main() {
  const phones = [
    '+919507813020', '+919072151087', '+918113874081', 
    '+917701904514', '+918260190793', '+917602153093'
  ];

  const { data: msgs, error } = await supabase
    .from('messages')
    .select('phone_normalised, status, error_code, sent_at, template_id, template_variant_id')
    .in('phone_normalised', phones)
    .order('sent_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error("ERROR:", error);
  } else {
    console.table(msgs);
  }
}
main();
