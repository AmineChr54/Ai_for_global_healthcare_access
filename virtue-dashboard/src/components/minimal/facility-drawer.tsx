'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Citation, FacilityWithDerived, Insight } from '@/types';
import { SlidePanel } from './slide-panel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InsightList } from './insight-list';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface FacilityDrawerProps {
  facility: FacilityWithDerived | null;
  allFacilities: FacilityWithDerived[];
  citations: Citation[];
  insights: Insight[];
  onClose: () => void;
}

const tabs = ['Overview', 'Evidence', 'Insights'] as const;

function parseList(value?: string) {
  if (!value) return [];
  return value
    .split(/,|;|\//)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function FacilityDrawer({ facility, allFacilities, citations, insights, onClose }: FacilityDrawerProps) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Overview');

  useEffect(() => {
    setActiveTab('Overview');
  }, [facility?.id]);

  const facilityCitations = useMemo(() => citations.filter((citation) => citation.rowId === facility?.id), [citations, facility?.id]);

  const chartData = useMemo(() => {
    if (!facility?.type) return [];
    const sameType = allFacilities.filter((item) => item.type === facility.type);
    const counts = new Map<string, number>();
    sameType.forEach((item) => {
      parseList(item.specialties).forEach((specialty) => {
        counts.set(specialty, (counts.get(specialty) ?? 0) + 1);
      });
    });
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [facility, allFacilities]);

  if (!facility) return null;

  return (
    <SlidePanel title="Facility details" isOpen={Boolean(facility)} onClose={onClose} widthClassName="w-[420px]">
      <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
          <p className="text-sm font-semibold text-[color:var(--text-primary)]">{facility.name}</p>
          <p className="text-xs text-[color:var(--text-muted)]">{facility.region} · {facility.type ?? 'Facility'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {facility.flags.map((flag) => (
              <Badge key={flag.message} variant="warning">
                {flag.type.replace('-', ' ')}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs',
                activeTab === tab
                  ? 'bg-[color:var(--bg-card)] text-[color:var(--text-primary)]'
                  : 'text-[color:var(--text-muted)]'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Capabilities</p>
              <p className="mt-1 text-[color:var(--text-primary)]">{facility.capabilities ?? 'No capability data'}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Procedures</p>
              <p className="mt-1 text-[color:var(--text-primary)]">{facility.services ?? 'No procedure data'}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Equipment</p>
              <p className="mt-1 text-[color:var(--text-primary)]">{facility.equipment ?? 'No equipment data'}</p>
            </div>

            <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
              <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Specialties by facility type</p>
              {chartData.length ? (
                <div className="mt-2 h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 90, bottom: 10 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={90}
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 14)}…` : value)}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(116, 192, 255, 0.12)' }}
                        contentStyle={{
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 12,
                          color: 'var(--text-primary)',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" fill="#74c0ff" radius={[6, 6, 6, 6]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[color:var(--text-muted)]">Not enough data to render chart.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Evidence' && (
          <div className="space-y-3">
            {facilityCitations.map((citation) => (
              <div key={citation.id} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-xs">
                <p className="text-[color:var(--text-primary)]">{citation.snippet}</p>
                <p className="mt-1 text-[color:var(--text-muted)]">{citation.field} · Row {citation.rowId}</p>
              </div>
            ))}
            {!facilityCitations.length && <p className="text-xs text-[color:var(--text-muted)]">No citations yet.</p>}
          </div>
        )}

        {activeTab === 'Insights' && (
          <InsightList insights={insights} />
        )}
      </div>
    </SlidePanel>
  );
}
