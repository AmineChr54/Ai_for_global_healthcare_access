'use client';

import type { Insight } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface InsightListProps {
  insights: Insight[];
  compact?: boolean;
  facilityLookup?: Map<string, string>;
  onSelectFacility?: (facilityId: string) => void;
}

export function InsightList({ insights, compact, facilityLookup, onSelectFacility }: InsightListProps) {
  if (!insights.length) {
    return <p className="text-xs text-[color:var(--text-muted)]">No insights yet.</p>;
  }

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={cn(
            'rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-sm text-[color:var(--text-primary)]',
            compact && 'p-2'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{insight.title}</p>
            <Badge variant="outline">{Math.round(insight.confidence * 100)}%</Badge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">{insight.rationale}</p>
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">Next: {insight.nextStep}</p>
          {!!insight.relatedFacilityIds.length && (
            <div className="mt-2 flex flex-wrap gap-2">
              {insight.relatedFacilityIds.slice(0, 3).map((facilityId) => (
                <button
                  key={facilityId}
                  onClick={() => onSelectFacility?.(facilityId)}
                  className="rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                >
                  {facilityLookup?.get(facilityId) ?? facilityId}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
