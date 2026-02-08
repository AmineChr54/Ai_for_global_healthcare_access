'use client';

import { useMemo, useState } from 'react';
import type { AgentQueryFilters } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { MapPin, ShieldCheck, Sparkles, Star, Zap } from 'lucide-react';

interface SidebarProps {
  filters: AgentQueryFilters;
  onFiltersChange: (filters: AgentQueryFilters) => void;
  regions: string[];
  facilityTypes: string[];
  stats: { total: number; anomalies: number; lastUpdated?: string };
  onLoadMock: () => void;
  onReloadCsv: () => void;
  isUsingMockData: boolean;
  isLoading: boolean;
  onOpenPlanner: () => void;
}

const NAV_ITEMS = [
  { label: 'Overview', icon: Sparkles },
  { label: 'Geospatial Intel', icon: MapPin },
  { label: 'Verification', icon: ShieldCheck },
  { label: 'Planning', icon: Star },
];

export function Sidebar({
  filters,
  onFiltersChange,
  regions,
  facilityTypes,
  stats,
  onLoadMock,
  onReloadCsv,
  isUsingMockData,
  isLoading,
  onOpenPlanner,
}: SidebarProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const sortedRegions = useMemo(() => regions.filter(Boolean).sort(), [regions]);
  const sortedTypes = useMemo(() => facilityTypes.filter(Boolean).sort(), [facilityTypes]);

  const pushKeyword = () => {
    if (!keywordInput.trim()) return;
    const newKeywords = Array.from(new Set([...(filters.capabilityKeywords ?? []), keywordInput.trim()]));
    onFiltersChange({ ...filters, capabilityKeywords: newKeywords });
    setKeywordInput('');
  };

  const removeKeyword = (keyword: string) => {
    onFiltersChange({ ...filters, capabilityKeywords: filters.capabilityKeywords?.filter((item) => item !== keyword) });
  };

  return (
    <aside className="flex h-full w-72 flex-col gap-6 rounded-3xl border border-white/10 bg-surface-soft/80 p-5 backdrop-blur-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Virtue Foundation</p>
        <h1 className="text-2xl font-semibold text-white">Living Map</h1>
        <p className="text-sm text-white/60">Glassmorphic intelligence cockpit</p>
      </div>

      <nav className="space-y-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <item.icon className="h-4 w-4 text-accent-blue" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        <p className="text-xs uppercase tracking-wide text-white/50">Dataset health</p>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="text-xl font-semibold text-white">{stats.total}</p>
            <p className="text-xs text-white/50">facilities</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-amber-300">{stats.anomalies}</p>
            <p className="text-xs text-white/50">anomaly signals</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/50">Updated {stats.lastUpdated ?? 'recently'}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onReloadCsv} disabled={isLoading}>
            Reload CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 border border-white/10"
            onClick={onLoadMock}
            disabled={isUsingMockData}
          >
            Load sample
          </Button>
        </div>
        {isUsingMockData && <p className="mt-2 text-xs text-amber-200">Using offline mock bundle</p>}
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">Filters</p>
        <div className="mt-3 space-y-4">
          <div>
            <label className="text-xs text-white/60">Region</label>
            <select
              className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              value={filters.region ?? ''}
              onChange={(event) => onFiltersChange({ ...filters, region: event.target.value || undefined })}
            >
              <option value="">All regions</option>
              {sortedRegions.map((region) => (
                <option key={region} value={region} className="bg-surface-soft text-black">
                  {region}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/60">Facility type</label>
            <select
              className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
              value={filters.type ?? ''}
              onChange={(event) => onFiltersChange({ ...filters, type: event.target.value || undefined })}
            >
              <option value="">All types</option>
              {sortedTypes.map((type) => (
                <option key={type} value={type} className="bg-surface-soft text-black">
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/60">Capability keywords</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    pushKeyword();
                  }
                }}
                placeholder="e.g. cataract, ICU"
              />
              <Button variant="secondary" size="sm" onClick={pushKeyword}>
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(filters.capabilityKeywords ?? []).map((keyword) => (
                <Badge key={keyword} variant="outline" className="flex items-center gap-1">
                  {keyword}
                  <button className="text-white/60" onClick={() => removeKeyword(keyword)}>
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-white">Show anomalies only</p>
              <p className="text-xs text-white/60">Focus on data requiring validation</p>
            </div>
            <Toggle
              pressed={filters.anomalyOnly}
              onPressedChange={(value) => onFiltersChange({ ...filters, anomalyOnly: value })}
              aria-label="Toggle anomaly filter"
            />
          </div>
        </div>
      </div>

      <Separator />
      <div className="rounded-2xl border border-accent-blue/40 bg-accent-blue/5 p-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-accent-blue">Planner shortcuts</p>
        <p className="mt-2 text-white/80">
          Convert map insights into action checklists with one click. Perfect for site visits, partner briefings, and donor
          notes.
        </p>
        <Button className="mt-3 w-full" size="sm" onClick={onOpenPlanner}>
          Launch planner
        </Button>
      </div>
    </aside>
  );
}
