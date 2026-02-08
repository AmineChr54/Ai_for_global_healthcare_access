'use client';

import type { FacilityWithDerived, Insight } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InsightList } from './insight-list';
import { Button } from '@/components/ui/button';

interface FacilityListProps {
  facilities: FacilityWithDerived[];
  selectedFacilityId?: string | null;
  onSelectFacility: (facilityId: string) => void;
  regionInsights: Insight[];
  onOpenInsights: () => void;
  facilityLookup?: Map<string, string>;
  emptyState?: { title: string; hint: string; actionLabel?: string; onAction?: () => void };
  filters: { requireOxygen: boolean; requireICU: boolean; anomaliesOnly: boolean };
  onToggleFilter: (key: 'requireOxygen' | 'requireICU' | 'anomaliesOnly') => void;
  specialtyOptions: string[];
  selectedSpecialties: string[];
  onSelectSpecialties: (specialties: string[]) => void;
}

function toChips(value?: string) {
  if (!value) return [];
  return value
    .split(/,|;|\//)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function FacilityList({
  facilities,
  selectedFacilityId,
  onSelectFacility,
  regionInsights,
  onOpenInsights,
  facilityLookup,
  emptyState,
  filters,
  onToggleFilter,
  specialtyOptions,
  selectedSpecialties,
  onSelectSpecialties,
}: FacilityListProps) {
  return (
    <section className="flex h-full flex-col rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--text-muted)]">Facilities</p>
          <p className="text-sm text-[color:var(--text-muted)]">{facilities.length} visible</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenInsights}>
          Insights
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => onToggleFilter('requireOxygen')}
          className={cn(
            'rounded-full border px-3 py-1',
            filters.requireOxygen
              ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
              : 'border-[color:var(--border-subtle)] text-[color:var(--text-muted)]'
          )}
        >
          Oxygen
        </button>
        <button
          onClick={() => onToggleFilter('requireICU')}
          className={cn(
            'rounded-full border px-3 py-1',
            filters.requireICU
              ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
              : 'border-[color:var(--border-subtle)] text-[color:var(--text-muted)]'
          )}
        >
          ICU
        </button>
        <button
          onClick={() => onToggleFilter('anomaliesOnly')}
          className={cn(
            'rounded-full border px-3 py-1',
            filters.anomaliesOnly
              ? 'border-red-400/50 bg-red-400/20 text-red-200'
              : 'border-[color:var(--border-subtle)] text-[color:var(--text-muted)]'
          )}
        >
          Anomalies
        </button>
        <div className="ml-auto">
          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
              Specialty {selectedSpecialties.length ? `(${selectedSpecialties.length})` : ''}
            </summary>
            <div className="absolute right-0 top-8 z-10 w-64 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-3 shadow-glass">
              <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Suggestions</p>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {specialtyOptions.map((specialty) => (
                  <label key={specialty} className="flex items-center justify-between text-xs text-[color:var(--text-primary)]">
                    <span className="capitalize">{specialty}</span>
                    <input
                      type="checkbox"
                      checked={selectedSpecialties.includes(specialty)}
                      onChange={() =>
                        onSelectSpecialties(
                          selectedSpecialties.includes(specialty)
                            ? selectedSpecialties.filter((item) => item !== specialty)
                            : [...selectedSpecialties, specialty]
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              {selectedSpecialties.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[color:var(--text-muted)]">
                  {selectedSpecialties.map((item) => (
                    <span key={item} className="rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
        <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Region insights</p>
        <div className="mt-2 max-h-40 overflow-y-auto pr-1">
          <InsightList insights={regionInsights} compact facilityLookup={facilityLookup} onSelectFacility={onSelectFacility} />
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {facilities.map((facility) => (
          <button
            key={facility.id}
            onClick={() => onSelectFacility(facility.id)}
            className={cn(
              'w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-left transition',
              selectedFacilityId === facility.id && 'border-accent-blue/60 shadow-glass'
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-[color:var(--text-primary)]">{facility.name}</p>
                <p className="text-xs text-[color:var(--text-muted)]">{facility.region} · {facility.type ?? 'Facility'}</p>
              </div>
              {facility.flags.length > 0 && <Badge variant="warning">{facility.flags.length} flags</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {toChips(facility.specialties).map((chip) => (
                <Badge key={chip} variant="outline">
                  {chip}
                </Badge>
              ))}
            </div>
          </button>
        ))}
        {!facilities.length && emptyState && (
          <div className="rounded-2xl border border-dashed border-[color:var(--border-subtle)] p-4 text-sm text-[color:var(--text-muted)]">
            <p className="font-semibold text-[color:var(--text-primary)]">{emptyState.title}</p>
            <p className="mt-1">{emptyState.hint}</p>
            {emptyState.actionLabel && emptyState.onAction && (
              <button className="mt-2 text-xs underline" onClick={emptyState.onAction}>
                {emptyState.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
