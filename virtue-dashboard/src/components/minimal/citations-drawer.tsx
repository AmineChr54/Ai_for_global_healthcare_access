'use client';

import type { Citation } from '@/types';
import { SlidePanel } from './slide-panel';

interface CitationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  citations: Citation[];
}

export function CitationsDrawer({ isOpen, onClose, citations }: CitationsDrawerProps) {
  return (
    <SlidePanel title="Citations" isOpen={isOpen} onClose={onClose} widthClassName="w-[360px]">
      <div className="h-full space-y-3 overflow-y-auto pr-1">
        {citations.map((citation) => (
          <div key={citation.id} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-xs">
            <p className="text-[color:var(--text-primary)]">{citation.snippet}</p>
            <p className="mt-1 text-[color:var(--text-muted)]">
              {citation.field} · Row {citation.rowId} · {Math.round(citation.confidence * 100)}%
            </p>
          </div>
        ))}
        {!citations.length && <p className="text-xs text-[color:var(--text-muted)]">No citations available.</p>}
      </div>
    </SlidePanel>
  );
}
