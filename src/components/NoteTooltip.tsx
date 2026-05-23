'use client';

import { useState, useRef, useCallback } from 'react';

interface Props {
  caller: string;
  notes: string;
}

export default function NoteTooltip({ caller, notes }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      top: r.top - 8,          // appear above the badge
      left: Math.min(r.left, window.innerWidth - 304), // clamp to viewport
    });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  const preview = notes.length > 60 ? notes.slice(0, 60) + '…' : notes;

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="mt-1.5 text-[10px] text-gray-400 cursor-default leading-tight max-w-[220px] truncate border-t border-gray-100 pt-1"
      >
        <span className="font-semibold text-gray-500 not-italic">{caller}:</span>{' '}
        <span className="italic">{preview}</span>
      </div>

      {pos && (
        <div
          className="fixed z-[9999] w-80 bg-gray-900 text-white text-xs rounded-lg px-4 py-3 shadow-2xl pointer-events-none leading-relaxed whitespace-pre-wrap"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          <p className="font-semibold text-gray-300 mb-1">{caller}</p>
          <p>{notes}</p>
        </div>
      )}
    </>
  );
}
