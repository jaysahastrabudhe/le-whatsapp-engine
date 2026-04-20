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
    </div>
  );
}
