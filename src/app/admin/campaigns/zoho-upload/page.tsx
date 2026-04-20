'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ZohoUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [templateSid, setTemplateSid] = useState('');
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    // Basic fetch of templates from an api route or we could just fetch them 
    // Usually admin/templates gets approved templates.
    fetch('/api/admin/templates') 
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTemplates(data);
        } else if (data.templates && Array.isArray(data.templates)) {
          // Fallback just in case
          setTemplates(data.templates);
        }
      })
      .catch(console.error);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/campaigns/zoho-upload/preview', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setPreviewData(data);
      setStep(2);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunch = async () => {
    if (!name || !templateSid) {
      alert('Please provide campaign name and template');
      return;
    }
    setLoading(true);
    
    try {
      const res = await fetch('/api/admin/campaigns/zoho-upload/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: previewData.rows,
          summary: previewData.summary,
          campaignName: name,
          templateSid: templateSid,
          templateName: templateName
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      router.push(`/admin/campaigns/${data.campaignId}`);
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Zoho Lead Upload Campaign</h1>
        <Link href="/admin/campaigns" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to Campaigns
        </Link>
      </div>

      <div className="bg-white border rounded-lg p-6 shadow-sm space-y-8">
        
        {/* Step 1 */}
        <div className={`space-y-4 ${step !== 1 ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold">1. Upload Zoho Leads CSV</h2>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {step === 1 && (
            <button 
              onClick={handlePreview} 
              disabled={!file || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Upload & Match'}
            </button>
          )}
        </div>

        {/* Step 2 */}
        {step >= 2 && (
          <div className={`space-y-4 pt-6 border-t ${step !== 2 ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-lg font-semibold">2. Preview Match Results</h2>
            <div className="flex gap-4 mb-4">
              <span className="bg-green-50 text-green-700 px-3 py-1 rounded border border-green-200">
                ✅ {previewData?.summary.matched} matched
              </span>
              <span className="bg-red-50 text-red-700 px-3 py-1 rounded border border-red-200">
                ❌ {previewData?.summary.skipped} skipped
              </span>
            </div>

            <div className="text-sm bg-gray-50 p-4 rounded max-h-60 overflow-y-auto border">
              <p className="font-semibold mb-2">Skipped (First 100)</p>
              <ul className="space-y-1 text-gray-600">
                {previewData?.rows.filter((r: any) => r.status === 'skipped').slice(0, 100).map((r: any, i: number) => (
                  <li key={i}>⚠️ {r.name || r.zoho_lead_id} ({r.phone}) — {r.skip_reason}</li>
                ))}
              </ul>
            </div>

            {step === 2 && previewData?.summary.matched > 0 && (
              <button 
                onClick={() => setStep(3)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
              >
                Proceed to Campaign setup
              </button>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4 pt-6 border-t">
            <h2 className="text-lg font-semibold">3. Launch Campaign</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Webinar Invite March"
                  className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-gray-300 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Template</label>
                <select
                  value={templateSid}
                  onChange={(e) => {
                    setTemplateSid(e.target.value);
                    const opt = e.target.options[e.target.selectedIndex];
                    setTemplateName(opt.getAttribute('data-name') || '');
                  }}
                  className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-gray-300 outline-none"
                >
                  <option value="">— Select a template —</option>
                  {templates.map((t) => (
                    <option key={t.sid} value={t.sid} data-name={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templates.length === 0 && <p className="text-xs text-red-500">Wait, fetching templates or no approved templates available.</p>}
              </div>
            </div>

            <button
              onClick={handleLaunch}
              disabled={loading || !name || !templateSid}
              className="w-full bg-gray-900 hover:bg-gray-700 text-white font-semibold py-3 rounded-md transition-colors text-sm disabled:opacity-50"
            >
              {loading ? 'Launching...' : `Launch to ${previewData.summary.matched} matched leads`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
