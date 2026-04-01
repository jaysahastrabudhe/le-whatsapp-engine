'use client';

import { useState, useEffect, useCallback } from 'react';

type PreviewRow = {
  phone: string;
  replyText: string;
  repliedAt: string | null;
  leadId: string | null;
  leadName: string | null;
  currentState: string | null;
  currentClass: string | null;
  autoClass: string;
  autoHotness: string;
  autoState: string;
  matched: boolean;
  // Editable override
  finalClass?: string;
};

type ImportLog = {
  id: string;
  type: string;
  filename: string | null;
  row_count: number;
  success_count: number;
  fail_count: number;
  created_at: string;
};

type ImportResult = {
  total: number;
  imported: number;
  failed: number;
  skipped: number;
  results: { phone: string; status: string; reason?: string }[];
};

const CLASS_OPTIONS = ['interested', 'fee_question', 'not_now', 'wrong_number', 'stop', 'other'];
const HOTNESS_MAP: Record<string, string> = {
  interested: 'hot', fee_question: 'warm', not_now: 'cold',
  wrong_number: 'dead', stop: 'dead', other: 'warm',
};
const STATE_MAP: Record<string, string> = {
  interested: 'wa_hot', fee_question: 'wa_hot', not_now: 'wa_nurture',
  wrong_number: 'wa_closed', stop: 'wa_closed', other: 'replied',
};

export default function ImportRepliesPage() {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [filename, setFilename] = useState('');
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load import history
  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/admin/import-replies/history');
    if (res.ok) {
      const data = await res.json();
      setImportLogs(data.logs || []);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Parse CSV from file input
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFilename(file.name);

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      setError('CSV must have a header row and at least one data row.');
      return;
    }

    // Parse header
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const phoneIdx = header.findIndex(h => h === 'phone' || h === 'phone number' || h === 'mobile');
    const replyIdx = header.findIndex(h => h === 'reply text' || h === 'reply' || h === 'message' || h === 'text');
    const dateIdx = header.findIndex(h => h === 'replied at' || h === 'date' || h === 'timestamp');

    if (phoneIdx === -1 || replyIdx === -1) {
      setError('CSV must have "Phone" and "Reply Text" columns. Found: ' + header.join(', '));
      return;
    }

    // Parse rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parse (handles quoted fields with commas)
      const cols = parseCSVLine(lines[i]);
      const phone = (cols[phoneIdx] || '').trim();
      const replyText = (cols[replyIdx] || '').trim();
      const repliedAt = dateIdx >= 0 ? (cols[dateIdx] || '').trim() : '';

      if (!phone || !replyText) continue;
      rows.push({ phone, replyText, repliedAt: repliedAt || undefined });
    }

    if (rows.length === 0) {
      setError('No valid rows found in CSV.');
      return;
    }

    // Send to preview API
    setLoading(true);
    try {
      const res = await fetch('/api/admin/import-replies/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Preview failed');
        setLoading(false);
        return;
      }
      const enriched = (data.previews as PreviewRow[]).map(p => ({
        ...p,
        finalClass: p.autoClass,
      }));
      setPreviews(enriched);
      setStep('preview');
    } catch (err: any) {
      setError('Network error: ' + err.message);
    }
    setLoading(false);
  }

  // Update classification for a row
  function updateClass(idx: number, newClass: string) {
    setPreviews(prev => prev.map((p, i) => i === idx ? { ...p, finalClass: newClass } : p));
  }

  // Confirm import
  async function handleConfirm() {
    setStep('importing');
    setError('');
    const confirmedRows = previews
      .filter(p => p.matched)
      .map(p => ({
        phone: p.phone,
        replyText: p.replyText,
        repliedAt: p.repliedAt,
        leadId: p.leadId,
        replyClass: p.finalClass || p.autoClass,
        hotness: HOTNESS_MAP[p.finalClass || p.autoClass] || 'warm',
        waState: STATE_MAP[p.finalClass || p.autoClass] || 'replied',
      }));

    try {
      const res = await fetch('/api/admin/import-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: confirmedRows, filename }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        setStep('preview');
        return;
      }
      setResult(data);
      setStep('done');
      loadHistory();
    } catch (err: any) {
      setError('Network error: ' + err.message);
      setStep('preview');
    }
  }

  // Reset
  function handleReset() {
    setStep('upload');
    setFilename('');
    setPreviews([]);
    setResult(null);
    setError('');
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Import Replies</h1>
        <p className="text-gray-500 mt-1">
          Upload a CSV of replies from manually-contacted leads. The system will auto-classify and update Supabase + Zoho.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ── STEP 1: Upload ───────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="bg-white border rounded-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upload Reply CSV</h3>
            <p className="text-sm text-gray-500 mt-1">
              CSV must have columns: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Phone</code>,{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Reply Text</code>, and optionally{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Replied At</code>
            </p>
          </div>
          <label className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg font-medium cursor-pointer hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {loading ? 'Processing…' : 'Choose CSV File'}
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
          </label>
          <div className="pt-2">
            <a
              href="/api/admin/export-failed"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              ↓ Download Failed Messages CSV (to use as a starting point)
            </a>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ──────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Preview — {previews.length} rows</h3>
              <p className="text-sm text-gray-500">
                {previews.filter(p => p.matched).length} matched to existing leads ·{' '}
                {previews.filter(p => !p.matched).length} unmatched (will be skipped)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-500 hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-6 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                disabled={previews.filter(p => p.matched).length === 0}
              >
                ✓ Confirm Import ({previews.filter(p => p.matched).length} leads)
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-lg overflow-x-auto shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-3 font-semibold text-gray-600">Lead</th>
                  <th className="p-3 font-semibold text-gray-600">Reply Text</th>
                  <th className="p-3 font-semibold text-gray-600">Classification</th>
                  <th className="p-3 font-semibold text-gray-600">Hotness</th>
                  <th className="p-3 font-semibold text-gray-600">→ State</th>
                  <th className="p-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {previews.map((row, idx) => {
                  const cls = row.finalClass || row.autoClass;
                  const hotness = HOTNESS_MAP[cls] || 'warm';
                  const state = STATE_MAP[cls] || 'replied';
                  return (
                    <tr key={idx} className={`border-b hover:bg-gray-50/50 ${!row.matched ? 'opacity-40' : ''}`}>
                      <td className="p-3">
                        <div className="font-medium text-gray-900">{row.leadName || '—'}</div>
                        <div className="text-xs text-gray-400 font-mono">{row.phone}</div>
                      </td>
                      <td className="p-3 max-w-xs">
                        <div className="text-gray-700 text-sm italic whitespace-pre-wrap break-words">
                          {row.replyText}
                        </div>
                      </td>
                      <td className="p-3">
                        {row.matched ? (
                          <select
                            value={cls}
                            onChange={(e) => updateClass(idx, e.target.value)}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-300 focus:outline-none"
                          >
                            {CLASS_OPTIONS.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          hotness === 'hot' ? 'bg-red-100 text-red-700' :
                          hotness === 'warm' ? 'bg-orange-100 text-orange-700' :
                          hotness === 'cold' ? 'bg-blue-100 text-blue-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {hotness}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-mono text-gray-500">{state}</span>
                      </td>
                      <td className="p-3">
                        {row.matched ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">matched</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">not found</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STEP 3: Importing ──────────────────────────────────────── */}
      {step === 'importing' && (
        <div className="bg-white border rounded-xl p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Importing replies and updating leads…</p>
        </div>
      )}

      {/* ── STEP 4: Done ───────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-8 text-center space-y-3">
            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Import Complete</h3>
            <div className="flex gap-6 justify-center text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{result.imported}</div>
                <div className="text-gray-500">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-400">{result.skipped}</div>
                <div className="text-gray-500">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">{result.failed}</div>
                <div className="text-gray-500">Failed</div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Zoho will be synced on the next reconcile cron run (hourly).
            </p>
            <button
              onClick={handleReset}
              className="mt-4 px-6 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Import Another
            </button>
          </div>

          {/* Per-row results */}
          {result.results.some(r => r.status !== 'ok') && (
            <div className="bg-white border rounded-lg overflow-x-auto shadow-sm">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-3 font-semibold text-gray-600">Phone</th>
                    <th className="p-3 font-semibold text-gray-600">Status</th>
                    <th className="p-3 font-semibold text-gray-600">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.filter(r => r.status !== 'ok').map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-3 font-mono text-xs">{r.phone}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.status === 'skipped' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-500">{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Import History ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Recent Import / Export History</h3>
        {importLogs.length === 0 ? (
          <p className="text-sm text-gray-400">No imports yet.</p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-3 font-semibold text-gray-600">Type</th>
                  <th className="p-3 font-semibold text-gray-600">File</th>
                  <th className="p-3 font-semibold text-gray-600 text-right">Rows</th>
                  <th className="p-3 font-semibold text-gray-600 text-right">Success</th>
                  <th className="p-3 font-semibold text-gray-600 text-right">Failed</th>
                  <th className="p-3 font-semibold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {importLogs.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50/50">
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.type === 'reply_import' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {log.type === 'reply_import' ? '↑ Import' : '↓ Export'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-700 text-xs font-mono">{log.filename || '—'}</td>
                    <td className="p-3 text-right text-gray-700">{log.row_count}</td>
                    <td className="p-3 text-right text-green-600 font-medium">{log.success_count}</td>
                    <td className="p-3 text-right text-red-500 font-medium">{log.fail_count}</td>
                    <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
