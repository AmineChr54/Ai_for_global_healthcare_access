'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentQuery, FacilityWithDerived, PlanItem } from '@/types';
import { useFacilitiesData, type FacilityDataSource } from '@/hooks/use-facilities-data';
import { runAgent } from '@/lib/agent';
import { randomId } from '@/lib/utils';
import { getMapLayers } from '@/lib/map-data/get-map-layers';
import { getPseudoCoordinates, isInBounds, type MapBounds } from '@/lib/map-data/geo';
import { generateFacilityInsights, generateRegionInsights } from '@/lib/insights';
import { ChatPanel, type ChatMessage } from './chat-panel';
import { LivingMap } from '@/components/map/living-map';
import { FacilityList } from './facility-list';
import { FacilityDrawer } from './facility-drawer';
import { CitationsDrawer } from './citations-drawer';
import { TraceDrawer } from './trace-drawer';
import { PlanDrawer } from './plan-drawer';
import { InsightsDrawer } from './insights-drawer';

const SUGGESTIONS = [
  'Where are the largest cold spots for cataract surgery within 50km?',
  'Which facilities claim ICU but list no oxygen?',
  'Show facilities offering pediatric care in Ashanti.',
];
const SPECIALTY_OPTIONS = [
  'anesthesia',
  'cardiac surgery',
  'cardiology',
  'critical care',
  'dentistry',
  'gastroenterology',
  'obstetrics',
  'ophthalmology',
  'pediatrics',
  'surgery',
];

interface MinimalDashboardProps {
  datasetPath: string;
}

export function MinimalDashboard({ datasetPath }: MinimalDashboardProps) {
  const [queryText, setQueryText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentResult, setAgentResult] = useState<ReturnType<typeof runAgent> | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [dataSource] = useState<FacilityDataSource>({
    type: 'csv',
    path: datasetPath,
  });
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  const [citationsOpen, setCitationsOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [autoRan, setAutoRan] = useState(false);
  const [filters, setFilters] = useState({ requireOxygen: false, requireICU: false, anomaliesOnly: false });
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);

  const facilitiesQuery = useFacilitiesData(dataSource);
  const facilities = facilitiesQuery.data ?? [];
  const isLoading = facilitiesQuery.isLoading;
  const derivedFacilities = useMemo<FacilityWithDerived[]>(
    () => facilities.map((facility) => ({ ...facility, flags: [], highlightFields: [] })),
    [facilities]
  );

  const baseFacilities = agentResult?.facilities ?? derivedFacilities;
  const filteredFacilities = useMemo(() => {
    return baseFacilities.filter((facility) => {
      if (filters.anomaliesOnly && facility.flags.length === 0) return false;
      if (filters.requireOxygen) {
        const hasOxygen = (facility.equipment ?? '').toLowerCase().includes('oxygen') || (facility.capabilities ?? '').toLowerCase().includes('oxygen');
        if (!hasOxygen) return false;
      }
      if (filters.requireICU) {
        const hasIcu = (facility.capabilities ?? '').toLowerCase().includes('icu');
        if (!hasIcu) return false;
      }
      if (selectedSpecialties.length) {
        const hay = `${facility.specialties ?? ''} ${facility.capabilities ?? ''} ${facility.services ?? ''}`.toLowerCase();
        const match = selectedSpecialties.some((specialty) => hay.includes(specialty.toLowerCase()));
        if (!match) return false;
      }
      return true;
    });
  }, [baseFacilities, filters, selectedSpecialties]);
  const facilityLookup = useMemo(
    () => new Map(baseFacilities.map((facility) => [facility.id, facility.name])),
    [baseFacilities]
  );
  const layerData = useMemo(() => getMapLayers(filteredFacilities, selectedSpecialties), [filteredFacilities, selectedSpecialties]);

  const facilitiesInBounds = useMemo(() => {
    return filteredFacilities.filter((facility) => {
      const lat = facility.latitude ?? getPseudoCoordinates(facility.id, facility.region).lat;
      const lng = facility.longitude ?? getPseudoCoordinates(facility.id, facility.region).lng;
      return isInBounds(lat, lng, mapBounds);
    });
  }, [filteredFacilities, mapBounds]);

  const regionInsights = useMemo(() => generateRegionInsights(filteredFacilities), [filteredFacilities]);

  const selectedFacility = useMemo(() => {
    return filteredFacilities.find((facility) => facility.id === selectedFacilityId) ?? null;
  }, [filteredFacilities, selectedFacilityId]);

  const facilityInsights = useMemo(() => {
    if (!selectedFacility) return [];
    return generateFacilityInsights(selectedFacility);
  }, [selectedFacility]);

  const runQuery = useCallback(() => {
    if (!facilities.length || !queryText.trim()) return;
    const query: AgentQuery = { text: queryText.trim(), mode: 'simple', filters: {} };
    const result = runAgent(query, facilities);
    setAgentResult(result);
    setSelectedFacilityId(result.facilities[0]?.id ?? null);
    setMessages((prev) => [
      ...prev,
      { id: randomId('user'), role: 'user', content: query.text },
      { id: randomId('assistant'), role: 'assistant', content: result.summary },
    ]);
  }, [facilities, queryText]);

  useEffect(() => {
    if (!autoRan) {
      setAutoRan(true);
    }
  }, [autoRan]);

  const generatePlanFromInsights = useCallback(() => {
    const insights = regionInsights.slice(0, 5);
    const newItems: PlanItem[] = insights.map((insight) => ({
      id: randomId('plan'),
      title: insight.title,
      region: insight.region ?? 'Unknown',
      facilityId: insight.relatedFacilityIds[0],
      priority: insight.confidence > 0.75 ? 'High' : 'Medium',
      rationale: insight.rationale,
      nextStep: insight.nextStep,
      status: 'todo',
    }));
    setPlanItems(newItems);
    setPlanOpen(true);
  }, [regionInsights]);

  return (
    <div className="min-h-screen bg-[color:var(--bg-base)] px-4 py-6 text-[color:var(--text-primary)]">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="h-[calc(100vh-3rem)]">
          <ChatPanel
            queryText={queryText}
            onQueryChange={setQueryText}
            onRun={runQuery}
            messages={messages}
            suggestions={SUGGESTIONS}
            agentResult={agentResult}
            onOpenCitations={() => setCitationsOpen(true)}
            onOpenTrace={() => setTraceOpen(true)}
            onOpenPlan={generatePlanFromInsights}
            onOpenInsights={() => setInsightsOpen(true)}
            selectedFacility={
              selectedFacility
                ? { name: selectedFacility.name, region: selectedFacility.region, type: selectedFacility.type }
                : null
            }
          />
        </div>

        <div className="flex h-[calc(100vh-3rem)] flex-col gap-4">
          <div className="flex-1 rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-3">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--text-muted)]">
                Loading facilities…
              </div>
            ) : (
            <LivingMap
              facilities={filteredFacilities}
              layerData={layerData}
              selectedFacilityId={selectedFacilityId}
              onSelectFacility={setSelectedFacilityId}
              onBoundsChange={setMapBounds}
              specialtyOptions={SPECIALTY_OPTIONS}
              selectedSpecialties={selectedSpecialties}
              onSelectSpecialties={setSelectedSpecialties}
            />
            )}
          </div>
          <div className="h-[320px]">
            <FacilityList
              facilities={facilitiesInBounds}
              selectedFacilityId={selectedFacilityId}
              onSelectFacility={setSelectedFacilityId}
              regionInsights={regionInsights}
              onOpenInsights={() => setInsightsOpen(true)}
              facilityLookup={facilityLookup}
              filters={filters}
              onToggleFilter={(key) => setFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              specialtyOptions={SPECIALTY_OPTIONS}
              selectedSpecialties={selectedSpecialties}
              onSelectSpecialties={setSelectedSpecialties}
              emptyState={
                facilitiesInBounds.length === 0
                  ? {
                      title: 'No matches in this view.',
                      hint: regionInsights[0]
                        ? `Try ${regionInsights[0].region} — ${regionInsights[0].title}`
                        : 'Zoom out or clear filters to see nearby facilities.',
                      actionLabel: 'Clear filters',
                      onAction: () => setFilters({ requireOxygen: false, requireICU: false, anomaliesOnly: false }),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      <FacilityDrawer
        facility={selectedFacility}
        allFacilities={baseFacilities}
        citations={agentResult?.citations ?? []}
        insights={facilityInsights}
        onClose={() => setSelectedFacilityId(null)}
      />

      <CitationsDrawer isOpen={citationsOpen} onClose={() => setCitationsOpen(false)} citations={agentResult?.citations ?? []} />
      <TraceDrawer isOpen={traceOpen} onClose={() => setTraceOpen(false)} trace={agentResult?.trace ?? []} />
      <InsightsDrawer
        isOpen={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        insights={regionInsights}
        facilityLookup={facilityLookup}
        onSelectFacility={setSelectedFacilityId}
      />
      <PlanDrawer
        isOpen={planOpen}
        onClose={() => setPlanOpen(false)}
        items={planItems}
        onItemsChange={setPlanItems}
        onGenerateFromInsights={generatePlanFromInsights}
      />
    </div>
  );
}
