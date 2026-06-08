'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type LeadResult = {
  id: string;
  name: string | null;
  phone_normalised: string;
  wa_state: string | null;
  wa_hotness: string | null;
};

const HOTNESS_STYLES: Record<string, string> = {
  hot:  'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cold: 'bg-blue-100 text-blue-700',
};

const SOURCES = ['Direct WhatsApp', 'Instagram', 'Web Chat', 'Email'];

export default function ManualReplyForm() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LeadResult[]>([]);
  const [selected, setSelected] = useState<LeadResult | null>(null);
  const [source, setSource] = useState(SOURCES[0]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/lead-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results || []);
        setOpen(true);
      } finally {
        setSearching(false);
      }
    }, 220);
  }, []);

  useEffect(() => {
    if (!selected) search(query);
  }, [query, selected, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(lead: LeadResult) {
    setSelected(lead);
    setQuery(lead.name || lead.phone_normalised);
    setOpen(false);
    setMessage(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setSelected(null);
    setMessage(null);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/manual-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected.phone_normalised, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add reply');
      setMessage({ text: `${selected.name || 'Lead'} added to Gargi's inbound box (${source}).`, type: 'success' });
      setQuery('');
      setSelected(null);
      setResults([]);
      router.refresh();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  const displayPhone = (p: string) => p.replace(/^\+91/, '');

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm border-blue-200">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-1">Manual Reply Entry</h2>
      <p className="text-xs text-gray-500 mb-4">Logged a reply from a lead (Instagram, Email, Direct WhatsApp…)? Pick the source and add them to Gargi&rsquo;s inbound box.</p>

      <form onSubmit={handleSubmit} className="flex gap-3 items-start">
        <div className="w-44 shrink-0">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            aria-label="Reply source"
          >
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div ref={containerRef} className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search by name or phone number…"
            autoComplete="off"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none pr-8"
          />
          {searching && (
            <span className="absolute right-2.5 top-2.5 text-gray-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </span>
          )}
          {selected && !searching && (
            <button
              type="button"
              onClick={() => { setSelected(null); setQuery(''); }}
              className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >×</button>
          )}

          {open && results.length > 0 && (
            <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {results.map((lead) => (
                <li
                  key={lead.id}
                  onMouseDown={() => handleSelect(lead)}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{lead.name || '—'}</div>
                    <div className="text-xs text-gray-400 font-mono">{displayPhone(lead.phone_normalised)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0">
                    {lead.wa_hotness && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${HOTNESS_STYLES[lead.wa_hotness] || 'bg-gray-100 text-gray-600'}`}>
                        {lead.wa_hotness}
                      </span>
                    )}
                    {lead.wa_state && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                        {lead.wa_state}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {open && results.length === 0 && !searching && query.length >= 2 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400">
              No leads found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !selected}
          className="bg-gray-900 text-white px-5 py-2 rounded-md font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {submitting ? 'Adding…' : 'Add Reply'}
        </button>
      </form>

      {selected && (
        <div className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-1.5 inline-flex items-center gap-2">
          <span className="font-medium">{selected.name}</span>
          <span className="text-blue-400 font-mono">{displayPhone(selected.phone_normalised)}</span>
          <span className="text-blue-400">selected</span>
        </div>
      )}

      {message && (
        <p className={`text-xs font-medium mt-2 ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
