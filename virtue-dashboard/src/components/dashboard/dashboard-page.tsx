'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentQuery, AgentQueryFilters, AgentQueryMode, AgentResult, FacilityWithDerived, PlanItem } from '@/types';
import { useFacilitiesData, type FacilityDataSource } from '@/hooks/use-facilities-data';
import { Sidebar } from './sidebar';
import { CommandBar } from './command-bar';
import { MetricsStrip } from './metrics-strip';
import { LivingMap } from '@/components/map/living-map';
import { ResultsTable } from './results-table';
import { FacilityDetailDrawer } from './facility-detail-drawer';
import { EvidenceDrawer } from '@/components/evidence/evidence-drawer';
import { PlanPanel } from '@/components/plan/plan-panel';
import { runAgent } from '@/lib/agent';
import { randomId } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

interface DashboardPageProps {
  datasetPath: string;
}

export function DashboardPage({ datasetPath }: DashboardPageProps) {
  const [queryText, setQueryText] = useState('Where are the largest cold spots for cataract surgery within 50km?');
  const [mode, setMode] = useState<AgentQueryMode>('simple');
  const [filters, setFilters] = useState<AgentQueryFilters>({});
  const [history, setHistory] = useState<AgentQuery[]>([]);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<FacilityDataSource>({ type: 'csv', path: datasetPath });
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [isEvidenceOpen, setEvidenceOpen] = useState(true);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState<'evidence' | 'trace' | 'planner'>('evidence');
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const specialtyOptions = [
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

  const facilitiesQuery = useFacilitiesData(dataSource);
  const facilities = facilitiesQuery.data ?? [];
  const derivedFacilities = useMemo<FacilityWithDerived[]>(() => facilities.map((facility) => ({ ...facility, flags: [], highlightFields: [] })), [facilities]);

  const regionOptions = useMemo(() => Array.from(new Set(facilities.map((facility) => facility.region ?? ''))), [facilities]);
  const typeOptions = useMemo(() => Array.from(new Set(facilities.map((facility) => facility.type ?? ''))), [facilities]);

  const runAgentQuery = useCallback(() => {
    if (!facilities.length) return;
    const query: AgentQuery = { text: queryText.trim(), mode, filters };
    const nextResult = runAgent(query, facilities);
    setAgentResult(nextResult);
    setSelectedFacilityId(nextResult.facilities[0]?.id ?? null);
    setEvidenceOpen(true);
    setActiveEvidenceTab('evidence');
    setHistory((prev) => [query, ...prev.filter((entry) => entry.text !== query.text)].slice(0, 5));
  }, [facilities, filters, mode, queryText]);

  useEffect(() => {
    if (facilities.length && !hasAutoRun) {
      runAgentQuery();
      setHasAutoRun(true);
    }
  }, [facilities.length, hasAutoRun, runAgentQuery]);

  const handleGeneratePlanFromResults = () => {
    if (!agentResult) return;
    const flagged = agentResult.facilities.filter((facility) => facility.flags.length);
    const candidates = (flagged.length ? flagged : agentResult.facilities).slice(0, 4);
    const generated = candidates.map((facility) => ({
      id: randomId('plan'),
      title: `Validate ${facility.name}`,
      region: facility.region ?? 'Unknown',
      facilityId: facility.id,
      priority: facility.flags.some((flag) => flag.type === 'claim-mismatch') ? 'High' : 'Medium',
      rationale: facility.flags.map((flag) => flag.message).join('; ') || 'Follow up on reported capability gaps.',
      nextStep: 'Assign field verifier + collect photographic evidence.',
      owner: 'Field Ops',
      dueDate: '',
      status: 'todo',
    }));
    setPlanItems((prev) => [...prev, ...generated]);
    setEvidenceOpen(true);
    setActiveEvidenceTab('planner');
  };

  const stats = useMemo(
    () => ({
      total: facilities.length,
      anomalies: agentResult?.facilities.reduce((sum, facility) => sum + facility.flags.length, 0) ?? 0,
      lastUpdated: agentResult?.createdAt,
    }),
    [agentResult, facilities.length]
  );

  const selectedFacility = useMemo<FacilityWithDerived | null>(() => {
    if (!agentResult) return null;
    return agentResult.facilities.find((facility) => facility.id === selectedFacilityId) ?? null;
  }, [agentResult, selectedFacilityId]);

  const isLoading = facilitiesQuery.isLoading || facilitiesQuery.isFetching;
  const error = facilitiesQuery.error;

  return (
    <div className="min-h-screen space-y-6 px-4 py-6 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[18rem_auto_28rem]">
        <Sidebar
          filters={filters}
          onFiltersChange={setFilters}
          regions={regionOptions}
          facilityTypes={typeOptions}
          stats={stats}
          onLoadMock={() => setDataSource({ type: 'mock' })}
          onReloadCsv={() => setDataSource({ type: 'csv', path: datasetPath })}
          isUsingMockData={dataSource.type === 'mock'}
          isLoading={isLoading}
          onOpenPlanner={() => {
            setEvidenceOpen(true);
            setActiveEvidenceTab('planner');
          }}
        />
        <div className="col-span-2 flex flex-col space-y-6">
          <CommandBar
            queryText={queryText}
            mode={mode}
            onModeChange={setMode}
            onQueryChange={setQueryText}
            onRun={runAgentQuery}
            history={history}
            disabled={!facilities.length}
          />

          {error && (
            <div className="rounded-3xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
              Unable to load CSV from {datasetPath}. Load the sample data instead.
              <Button size="sm" variant="ghost" className="ml-3" onClick={() => setDataSource({ type: 'mock' })}>
                Load sample data
              </Button>
            </div>
          )}

          {isLoading ? <Skeleton className="h-48 w-full rounded-3xl" /> : <MetricsStrip result={agentResult} />}

          <div className="h-[540px] rounded-3xl border border-white/10 bg-white/5 p-4">
            {facilities.length ? (
              <PanelGroup direction="horizontal" className="h-full">
                <Panel defaultSize={60} minSize={35} className="pr-2">
                  <div className="h-full">
                    <LivingMap
                      facilities={agentResult?.facilities ?? derivedFacilities}
                      selectedFacilityId={selectedFacilityId}
                      onSelectFacility={setSelectedFacilityId}
                      specialtyOptions={specialtyOptions}
                      selectedSpecialties={selectedSpecialties}
                      onSelectSpecialties={setSelectedSpecialties}
                    />
                  </div>
                </Panel>
                <PanelResizeHandle className="w-1 rounded-full bg-white/10" />
                <Panel defaultSize={40} minSize={30} className="pl-2">
                  <ResultsTable
                    facilities={agentResult?.facilities ?? derivedFacilities}
                    isLoading={isLoading}
                    onRowSelect={setSelectedFacilityId}
                    selectedFacilityId={selectedFacilityId}
                    onRefresh={runAgentQuery}
                  />
                </Panel>
              </PanelGroup>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-sm text-white/60">
                <p>Load the CSV or mock data to activate the Living Map.</p>
                <Button className="mt-3" variant="secondary" onClick={() => setDataSource({ type: 'mock' })}>
                  Load sample bundle
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <FacilityDetailDrawer facility={selectedFacility} citations={agentResult?.citations ?? []} onClose={() => setSelectedFacilityId(null)} />

      <EvidenceDrawer
        isOpen={isEvidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        agentResult={agentResult}
        planSlot={<PlanPanel items={planItems} onItemsChange={setPlanItems} onGenerateFromResults={handleGeneratePlanFromResults} regions={regionOptions} />}
        activeTab={activeEvidenceTab}
        onTabChange={setActiveEvidenceTab}
      />
    </div>
  );
}
