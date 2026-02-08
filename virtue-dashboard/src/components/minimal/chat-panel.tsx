'use client';

import type { AgentResult, AgentQuery } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface ChatPanelProps {
  queryText: string;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  messages: ChatMessage[];
  suggestions: string[];
  agentResult: AgentResult | null;
  onOpenCitations: () => void;
  onOpenTrace: () => void;
  onOpenPlan: () => void;
  onOpenInsights: () => void;
  selectedFacility?: { name: string; region: string; type?: string } | null;
}

export function ChatPanel({
  queryText,
  onQueryChange,
  onRun,
  messages,
  suggestions,
  agentResult,
  onOpenCitations,
  onOpenTrace,
  onOpenPlan,
  onOpenInsights,
  selectedFacility,
}: ChatPanelProps) {
  return (
    <section className="flex h-full flex-col rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--text-muted)]">Virtue Foundation</p>
          <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">Living Map</h1>
          <p className="text-xs text-[color:var(--text-muted)]">Ask. See. Verify. Plan.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {suggestions.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            onClick={() => onQueryChange(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      {selectedFacility && (
        <div className="mb-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Selected facility</p>
          <p className="mt-1 font-semibold text-[color:var(--text-primary)]">{selectedFacility.name}</p>
          <p className="text-xs text-[color:var(--text-muted)]">
            {selectedFacility.region} · {selectedFacility.type ?? 'Facility'}
          </p>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((message, index) => {
          const trimmed = message.content.trim().toLowerCase();
          if (trimmed === 'assistant' || trimmed === 'user') return null;
          return (
          <div
            key={message.id}
            className={cn(
              'rounded-2xl border border-[color:var(--border-subtle)] p-3 text-sm',
              message.role === 'assistant' ? 'bg-[color:var(--bg-card)]' : 'bg-transparent'
            )}
          >
            <p className="text-[color:var(--text-primary)]">{message.content}</p>

            {message.role === 'assistant' && agentResult && index === messages.length - 1 && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {agentResult.metrics.slice(0, 3).map((metric) => (
                    <Badge key={metric.label} variant="outline">
                      {metric.label}: {metric.value}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={onOpenCitations}>
                    Show citations
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onOpenTrace}>
                    Trace
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onOpenInsights}>
                    Insights
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onOpenPlan}>
                    Create plan
                  </Button>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          placeholder="Ask Virtue Agent..."
          value={queryText}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onRun();
            }
          }}
          className="h-12"
        />
        <Button className="h-12" onClick={onRun}>
          Ask
        </Button>
      </div>
    </section>
  );
}
