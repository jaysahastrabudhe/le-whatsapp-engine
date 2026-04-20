import { getApprovedTemplates } from '@/lib/twilio/templates';
import Link from 'next/link';
import CampaignCreateForm from './CampaignCreateForm';

export default async function CreateCampaignPage() {
  const templates = await getApprovedTemplates().catch(() => []);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Create Campaign</h1>
        <Link href="/admin/campaigns" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </Link>
      </div>

      <CampaignCreateForm templates={templates} />

      {/* Campaign Guidelines Section */}
      <div className="mt-12 border-t pt-8">
        <div className="bg-gray-50 border rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">📘 Campaign Rules & Best Practices</h2>
            <p className="text-sm text-gray-500 mt-1">Please review these guidelines before launching bulk campaigns.</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">1</div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">The Send Window (9 AM – 8 PM IST)</h3>
                <p className="text-sm text-gray-600 mt-1">Campaign messages will only be delivered between 9:00 AM and 8:00 PM IST. If you launch or schedule a campaign outside of these hours, the messages will be queued and will automatically start sending when the next window opens.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">2</div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Rate Limiting (Pacing)</h3>
                <p className="text-sm text-gray-600 mt-1">To prevent our number from being blocked or flagged by WhatsApp, the campaign engine automatically paces messages at a maximum rate of <b>30 messages per minute</b>. Large campaigns will take time to deliver fully.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">3</div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Automatic Lead Safety Filters</h3>
                <p className="text-sm text-gray-600 mt-1">You do not need to worry about messaging the wrong type of lead. Even if you leave all segment filters blank, the system <b>automatically excludes</b> leads marked as <code>Dead</code>, <code>Closed</code>, or <code>Invalid Number</code>, as well as leads who have explicitly <code>Opted Out</code> (or sent a STOP command).</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">4</div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Global Deduplication (Anti-Spam)</h3>
                <p className="text-sm text-gray-600 mt-1">Use the <b>Global Deduplication Window</b> setting above to ensure you aren't overwhelming leads. If you set this to <code>7</code> days, anyone who received <i>any</i> campaign message in the last week will be skipped for this new campaign, regardless of their segment match.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">5</div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Template Variables</h3>
                <p className="text-sm text-gray-600 mt-1">All approved Twilio templates are supported. By default, the system automatically replaces the first variable <code>{`{{1}}`}</code> in your template with the lead's <b>First Name</b> (or "there" if the name is unknown). Ensure your chosen templates make sense with this default setting!</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">6</div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Automated Follow-Ups & Routing</h3>
                <p className="text-sm text-gray-600 mt-1">Campaigns bypass the standard 2-message bot cooldown, ensuring your blast gets through. However, once a lead <i>replies</i> to your campaign, the standard inbound conversational engine wakes up and routes the reply based on your workflow rules.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
