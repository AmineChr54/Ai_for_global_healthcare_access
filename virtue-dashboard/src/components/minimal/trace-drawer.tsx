'use client';

import type { AgentTraceStep } from '@/types';
import { SlidePanel } from './slide-panel';

interface TraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trace: AgentTraceStep[];
}

export function TraceDrawer({ isOpen, onClose, trace }: TraceDrawerProps) {
  return (
    <SlidePanel title="Trace" isOpen={isOpen} onClose={onClose} widthClassName="w-[360px]">
      <div className="h-full space-y-3 overflow-y-auto pr-1">
        {trace.map((step) => (
          <div key={step.stepName} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-xs">
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">{step.stepName}</p>
            <p className="mt-1 text-[color:var(--text-muted)]">{step.output}</p>
            <div className="mt-2 space-y-1 text-[color:var(--text-muted)]">
              {step.citations.slice(0, 2).map((citation) => (
                <p key={citation.id}>• {citation.snippet}</p>
              ))}
            </div>
          </div>
        ))}
        {!trace.length && <p className="text-xs text-[color:var(--text-muted)]">No trace steps yet.</p>}
      </div>
    </SlidePanel>
  );
}
