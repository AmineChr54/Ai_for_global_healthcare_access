'use client';

import { useRef, useEffect, useState } from 'react';
import type { AgentResult } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    intent?: string;
    agents?: string[];
    citations?: any[];
    elapsed?: number;
    facilityNames?: string[];
  };
};

interface ChatPanelProps {
  queryText: string;
  onQueryChange: (value: string) => void;
  onSubmit: (question: string) => void;
  messages: ChatMessage[];
  suggestions: string[];
  agentResult: AgentResult | null;
  onOpenCitations: () => void;
  onOpenTrace: () => void;
  onOpenPlan: () => void;
  onOpenInsights: () => void;
  selectedFacility?: { name: string; region: string; type?: string } | null;
  isLoading?: boolean;
  highlightedCount?: number;
}

export function ChatPanel({
  queryText,
  onQueryChange,
  onSubmit,
  messages,
  suggestions,
  agentResult,
  onOpenCitations,
  onOpenTrace,
  onOpenPlan,
  onOpenInsights,
  selectedFacility,
  isLoading,
  highlightedCount,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = () => {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  };

  return (
    <section className="flex h-full flex-col rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--text-muted)]">
            Virtue Foundation
          </p>
          <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">Living Map</h1>
          <p className="text-xs text-[color:var(--text-muted)]">Ask. See. Verify. Plan.</p>
        </div>
        <ThemeToggle />
      </div>

      {/* Suggestions */}
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

      {/* Selected facility badge */}
      {selectedFacility && (
        <div className="mb-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            Selected facility
          </p>
          <p className="mt-1 font-semibold text-[color:var(--text-primary)]">
            {selectedFacility.name}
          </p>
          <p className="text-xs text-[color:var(--text-muted)]">
            {selectedFacility.region} · {selectedFacility.type ?? 'Facility'}
          </p>
        </div>
      )}

      {/* Highlighted count */}
      {(highlightedCount ?? 0) > 0 && (
        <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {highlightedCount} facilities highlighted on map
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-[color:var(--text-muted)]">
              Ask about Ghana healthcare facilities.
            </p>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              Results will be highlighted on the map.
            </p>
          </div>
        )}

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
              {message.role === 'assistant' ? (
                <div className="space-y-2">
                  <div
                    className="prose prose-sm max-w-none text-[color:var(--text-primary)]"
                    dangerouslySetInnerHTML={{
                      __html: message.content
                        .replace(
                          /### (.*)/g,
                          '<h4 class="text-sm font-bold mt-2 mb-1">$1</h4>'
                        )
                        .replace(
                          /## (.*)/g,
                          '<h3 class="text-sm font-bold mt-2 mb-1">$1</h3>'
                        )
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n- /g, '<br/>- ')
                        .replace(/\n\d+\. /g, (m) => '<br/>' + m.trim() + ' ')
                        .replace(/\n/g, '<br/>'),
                    }}
                  />

                  {/* Metadata */}
                  {message.metadata && (
                    <div className="mt-2 border-t border-[color:var(--border-subtle)] pt-2">
                      <div className="flex flex-wrap gap-1.5 text-xs text-[color:var(--text-muted)]">
                        {message.metadata.intent && (
                          <span className="rounded bg-accent-blue/20 px-1.5 py-0.5 text-accent-blue">
                            {message.metadata.intent}
                          </span>
                        )}
                        {message.metadata.agents?.map((a) => (
                          <span
                            key={a}
                            className="rounded bg-white/10 px-1.5 py-0.5"
                          >
                            {a}
                          </span>
                        ))}
                        {message.metadata.elapsed && (
                          <span className="text-[color:var(--text-muted)]">
                            {typeof message.metadata.elapsed === 'number'
                              ? message.metadata.elapsed.toFixed(1)
                              : message.metadata.elapsed}
                            s
                          </span>
                        )}
                      </div>
                      {message.metadata.facilityNames &&
                        message.metadata.facilityNames.length > 0 && (
                          <div className="mt-1.5 text-xs text-amber-300">
                            {message.metadata.facilityNames.length} facilities
                            referenced
                          </div>
                        )}
                    </div>
                  )}

                  {/* Action buttons on last assistant message */}
                  {message.role === 'assistant' &&
                    agentResult &&
                    index === messages.length - 1 && (
                      <div className="mt-3 space-y-3">
                        {agentResult.metrics.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {agentResult.metrics.slice(0, 3).map((metric) => (
                              <Badge key={metric.label} variant="outline">
                                {metric.label}: {metric.value}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={onOpenCitations}
                          >
                            Show citations
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenTrace}
                          >
                            Trace
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenInsights}
                          >
                            Insights
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenPlan}
                          >
                            Create plan
                          </Button>
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <p className="text-[color:var(--text-primary)]">{message.content}</p>
              )}
            </div>
          );
        })}

        {/* Loading indicator */}
        {isLoading && (
          <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-accent-blue"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-accent-blue"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-accent-blue"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="text-xs text-[color:var(--text-muted)]">
                Analyzing with AI agents...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <Input
          placeholder="Ask about Ghana healthcare..."
          value={queryText}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleSubmit();
            }
          }}
          disabled={isLoading}
          className="h-12"
        />
        <Button className="h-12" onClick={handleSubmit} disabled={isLoading}>
          Ask
        </Button>
      </div>
    </section>
  );
}
