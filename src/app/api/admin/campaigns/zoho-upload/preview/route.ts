import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// A simple local CSV parser to handle basic quoted strings
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let currentWord = '';
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"' && row[i+1] === '"') {
      currentWord += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentWord);
      currentWord = '';
    } else {
      currentWord += char;
    }
  }
  result.push(currentWord);
  return result;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const zohoModule = (formData.get('zoho_module') as string) || 'leads';
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    // Split by newlines, being careful about newlines inside quotes
    // A quick hack: only split on newlines followed by a non-quote character or start of zoho id
    // More robust: just split by newline and re-assemble if quotes are unbalanced
    const rawLines = text.split(/\r?\n/);
    const lines: string[] = [];
    let currentLine = '';
    let quoteCount = 0;

    for (const line of rawLines) {
      quoteCount += (line.match(/"/g) || []).length;
      if (currentLine) {
        currentLine += '\n' + line;
      } else {
        currentLine = line;
      }
      if (quoteCount % 2 === 0) {
        if (currentLine) lines.push(currentLine);
        currentLine = '';
        quoteCount = 0;
      }
    }

    if (lines.length < 2) {
      return NextResponse.json({ error: 'Empty CSV or only header row' }, { status: 400 });
    }

    const headers = parseCSVRow(lines[0]).map(h => h.trim());
    const idIdx = headers.indexOf('Record Id');
    const mobileIdx = headers.indexOf('Mobile');
    const phoneIdx = headers.indexOf('Phone');
    const fnameIdx = headers.indexOf('First Name');
    const lnameIdx = headers.indexOf('Last Name');

    if (idIdx === -1) {
      return NextResponse.json({ error: 'Missing "Record Id" column' }, { status: 400 });
    }

    const parsedData = lines.slice(1).filter(l => l.trim().length > 0).map(l => {
      const row = parseCSVRow(l);
      return {
        zoho_lead_id: row[idIdx]?.trim() || '',
        mobile: mobileIdx !== -1 ? (row[mobileIdx] || '').trim() : '',
        phone: phoneIdx !== -1 ? (row[phoneIdx] || '').trim() : '',
        first_name: fnameIdx !== -1 ? (row[fnameIdx] || '').trim() : '',
        last_name: lnameIdx !== -1 ? (row[lnameIdx] || '').trim() : '',
      };
    }).filter(d => d.zoho_lead_id !== '');

    console.log(`[CSV] Parsed ${parsedData.length} valid rows.`);

    // Match with db
    const zohoIds = parsedData.map(d => d.zoho_lead_id);
    const { data: leadsByIds } = await supabase
      .from('leads')
      .select('id, zoho_lead_id, phone_normalised, name, wa_opt_in, wa_state, wa_hotness')
      .in('zoho_lead_id', zohoIds);

    const matchResults = [];
    let matched = 0;
    let staged = 0;
    let skipped = 0;

    for (const row of parsedData) {
      let rawPhone = row.mobile || row.phone;
      let cleanPhone = '';
      if (rawPhone) {
        rawPhone = rawPhone.replace(/\D/g, '');
        if (rawPhone.startsWith('91') && rawPhone.length === 12) {
          cleanPhone = `+${rawPhone}`;
        } else if (rawPhone.length === 10) {
          cleanPhone = `+91${rawPhone}`;
        } else {
          cleanPhone = `+${rawPhone}`;
        }
      }

      // Try exact ID match
      let dbLead = leadsByIds?.find(l => l.zoho_lead_id === row.zoho_lead_id);
      
      // Fallback phone match if no exact ID match? We didn't fetch all phones yet.
      if (!dbLead && cleanPhone) {
        const { data: phoneLeads } = await supabase
          .from('leads')
          .select('id, zoho_lead_id, phone_normalised, name, wa_opt_in, wa_state, wa_hotness')
          .eq('phone_normalised', cleanPhone)
          .single();
        if (phoneLeads) dbLead = phoneLeads;
      }

      const fullname = `${row.first_name} ${row.last_name}`.trim();

      const resultRow: any = {
        zoho_lead_id: row.zoho_lead_id,
        name: fullname,
        phone: cleanPhone || row.mobile || row.phone,
        lead_id: null,
        status: 'skipped'
      };

      if (!dbLead && cleanPhone) {
        // Stage the contact — will be inserted into campaign_contacts at commit time
        resultRow.status = 'staged';
        resultRow.zoho_module = zohoModule;
        staged++;
      } else if (!dbLead) {
        resultRow.skip_reason = 'not_in_system_no_phone';
        skipped++;
      } else if (!cleanPhone) {
        resultRow.skip_reason = 'no_phone';
        resultRow.lead_id = dbLead.id;
        skipped++;
      } else if (!dbLead.wa_opt_in) {
        resultRow.skip_reason = 'opted_out';
        resultRow.lead_id = dbLead.id;
        skipped++;
      } else if (dbLead.wa_state === 'invalid_number' || dbLead.wa_state === 'wa_closed') {
        resultRow.skip_reason = 'opted_out';
        resultRow.lead_id = dbLead.id;
        skipped++;
      } else {
        resultRow.status = 'matched';
        resultRow.lead_id = dbLead.id;
        resultRow.wa_state = dbLead.wa_state;
        resultRow.wa_hotness = dbLead.wa_hotness;
        matched++;
      }

      matchResults.push(resultRow);
    }

    return NextResponse.json({
      rows: matchResults,
      zohoModule,
      summary: {
        matched,
        staged,
        skipped,
        total: matchResults.length,
        sendable: matched + staged,
      }
    });

  } catch (error: any) {
    console.error('[API] Form parse error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
