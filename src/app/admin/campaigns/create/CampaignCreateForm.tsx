'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CampaignCreateForm({ templates }: { templates: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  
  const [filters, setFilters] = useState({
    name: '',
    templateSid: '',
    templateName: '',
    wa_state: '',
    persona: '',
    urgency: '',
    lead_track: '',
    lead_source: '',
    wa_hotness: ''
  });

  const getPreviewCount = useCallback(async (currentFilters: typeof filters) => {
    const params = new URLSearchParams();
    if (currentFilters.wa_state) params.set('wa_state', currentFilters.wa_state);
    if (currentFilters.persona) params.set('persona', currentFilters.persona);
    if (currentFilters.urgency) params.set('urgency', currentFilters.urgency);
    if (currentFilters.lead_track) params.set('lead_track', currentFilters.lead_track);
    if (currentFilters.lead_source) params.set('lead_source', currentFilters.lead_source);
    if (currentFilters.wa_hotness) params.set('wa_hotness', currentFilters.wa_hotness);

    try {
      const res = await fetch(`/api/admin/campaigns/preview-count?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAudienceCount(data.count);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      getPreviewCount(filters);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters, getPreviewCount]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'templateSid') {
      const opt = (e.target as HTMLSelectElement).options[(e.target as HTMLSelectElement).selectedIndex];
      const templateName = opt.getAttribute('data-name') || '';
      setFilters(prev => ({ ...prev, templateSid: value, templateName }));
    } else {
      setFilters(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: filters.name,
          templateSid: filters.templateSid,
          templateName: filters.templateName,
          segment: {
            lead_source: filters.lead_source || undefined,
            wa_hotness: filters.wa_hotness || undefined,
            wa_state: filters.wa_state || undefined,
            persona: filters.persona || undefined,
            urgency: filters.urgency || undefined,
            lead_track: filters.lead_track || undefined,
          }
        })
      });

      if (!res.ok) throw new Error('Failed to create campaign');
      router.push('/admin/campaigns');
    } catch (error) {
      console.error(error);
      alert('Failed to launch campaign');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 shadow-sm space-y-6">

      {/* Campaign name */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">Campaign Name</label>
        <input
          type="text"
          name="name"
          required
          value={filters.name}
          onChange={handleChange}
          placeholder="e.g. Meta Leads Re-engagement March"
          className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none"
        />
      </div>

      {/* Template dropdown */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">Template</label>
        {templates.length === 0 ? (
          <p className="text-sm text-red-500">
            No approved templates found. Go to{' '}
            <Link href="/admin/templates" className="underline">Templates</Link>{' '}
            and hit Refresh.
          </p>
        ) : (
          <select
            name="templateSid"
            required
            value={filters.templateSid}
            onChange={handleChange}
            className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none"
          >
            <option value="">— Select a template —</option>
            {templates.map((t) => (
              <option key={t.sid} value={t.sid} data-name={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-gray-400">Only approved Twilio templates are shown.</p>
      </div>

      {/* Audience segment */}
      <div className="pt-4 border-t space-y-4">
        <div className="flex items-center justify-between">
          <div>
             <h3 className="font-semibold text-gray-900">Audience Segment</h3>
             <p className="text-xs text-gray-500 mt-0.5">Filters opted-in, non-dead leads.</p>
          </div>
          <div className="text-sm font-medium bg-blue-50 text-blue-800 px-3 py-1 rounded-full">
            📊 {audienceCount !== null ? `${audienceCount} leads` : 'calculating...'} will be targeted
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">WA State</label>
            <select name="wa_state" value={filters.wa_state} onChange={handleChange} className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none">
              <option value="">Any</option>
              <option value="followup_sent">followup_sent</option>
              <option value="replied">replied</option>
              <option value="wa_sla_resolved">wa_sla_resolved</option>
              <option value="first_sent">first_sent</option>
              <option value="wa_hot">wa_hot</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Persona</label>
            <select name="persona" value={filters.persona} onChange={handleChange} className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none">
              <option value="">Any</option>
              <option value="Student">Student</option>
              <option value="Parent">Parent</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Urgency</label>
            <select name="urgency" value={filters.urgency} onChange={handleChange} className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none">
              <option value="">Any</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Lead Track</label>
            <select name="lead_track" value={filters.lead_track} onChange={handleChange} className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none">
              <option value="">Any</option>
              <option value="enterprise_leadership">Enterprise Leadership</option>
              <option value="family_business">Family Business</option>
              <option value="venture_builder">Venture Builder</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Lead Source</label>
            <input
              type="text"
              name="lead_source"
              value={filters.lead_source}
              onChange={handleChange}
              placeholder="e.g. Meta Ads"
              className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Hotness</label>
            <select
              name="wa_hotness"
              value={filters.wa_hotness}
              onChange={handleChange}
              className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none"
            >
              <option value="">Any</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pt-2 bg-amber-50 border border-amber-100 rounded-md p-3 text-xs text-amber-700">
        Campaign messages are rate-limited to 30/min via the campaign queue.
        Messages go out only within the 9am–8pm IST send window.
      </div>

      <button
        type="submit"
        disabled={loading || audienceCount === 0}
        className="w-full bg-gray-900 focus:bg-gray-700 hover:bg-gray-700 disabled:opacity-50 text-white font-semibold py-3 rounded-md transition-colors text-sm"
      >
        {loading ? 'Launching...' : 'Launch Campaign'}
      </button>
    </form>
  );
}
