'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import CreateTemplateModal from './CreateTemplateModal';

export default function CreateTemplateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
      >
        <Plus size={15} />
        Create Template
      </button>
      {open && <CreateTemplateModal onClose={() => setOpen(false)} />}
    </>
  );
}
