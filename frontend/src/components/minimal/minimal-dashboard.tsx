'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentQuery, FacilityWithDerived, PlanItem, Facility } from '@/types';
import { runAgent } from '@/lib/agent';
import { randomId } from '@/lib/utils';
import { getMapLayers } from '@/lib/map-data/get-map-layers';
import { getPseudoCoordinates, isInBounds, type MapBounds } from '@/lib/map-data/geo';
import { generateFacilityInsights, generateRegionInsights } from '@/lib/insights';
import { ChatPanel, type ChatMessage } from './chat-panel';
import { FacilityList } from './facility-list';
import { FacilityDrawer } from './facility-drawer';
import { CitationsDrawer } from './citations-drawer';
import { TraceDrawer } from './trace-drawer';
import { PlanDrawer } from './plan-drawer';
import { InsightsDrawer } from './insights-drawer';

// Dynamic import for Leaflet map (no SSR)
const LivingMap = dynamic(
  () => import('@/components/map/living-map').then((mod) => ({ default: mod.LivingMap })),
  { ssr: false }
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const SUGGESTIONS = [
  'Which facilities have cardiology specialists?',
  'Where are the medical deserts for ophthalmology?',
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

// --- Data types for JSON facilities ---
interface JsonFacility {
  id: string;
  uid: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  region: string;
  type: string;
  operator: string;
  specialties: string[];
  procedures: string[];
  equipment: string[];
  capabilities: string[];
  doctors: number | null;
  beds: number | null;
  orgType: string;
  description: string;
  website: string;
}

function mapJsonToFacility(f: JsonFacility): Facility {
  return {
    id: f.id || f.uid,
    name: f.name,
    region: f.region || 'Unknown',
    district: f.city,
    type: f.type,
    operator: f.operator,
    latitude: f.lat,
    longitude: f.lon,
    specialties: Array.isArray(f.specialties) ? f.specialties.join(', ') : (f.specialties ?? ''),
    capabilities: Array.isArray(f.capabilities) ? f.capabilities.join(', ') : (f.capabilities ?? ''),
    equipment: Array.isArray(f.equipment) ? f.equipment.join(', ') : (f.equipment ?? ''),
    services: Array.isArray(f.procedures) ? f.procedures.join(', ') : (f.procedures ?? ''),
    notes: f.description,
    confidence: 0.65 + Math.random() * 0.25,
  };
}

function matchFacilityNames(apiNames: string[], facilities: FacilityWithDerived[]): Set<string> {
  const matched = new Set<string>();
  for (const apiName of apiNames) {
    const lower = apiName.toLowerCase().trim();
    // Exact match first
    const exact = facilities.find((f) => f.name.toLowerCase() === lower);
    if (exact) {
      matched.add(exact.id);
      continue;
    }
    // Fuzzy: check if facility name contains the API name or vice versa
    const fuzzy = facilities.find(
      (f) => f.name.toLowerCase().includes(lower) || lower.includes(f.name.toLowerCase())
    );
    if (fuzzy) {
      matched.add(fuzzy.id);
    }
  }
  return matched;
}

export function MinimalDashboard() {
  // Data state
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Chat state
  const [queryText, setQueryText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [agentResult, setAgentResult] = useState<ReturnType<typeof runAgent> | null>(null);

  // Map state
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [highlightedFacilityIds, setHighlightedFacilityIds] = useState<Set<string>>(new Set());

  // Drawer state
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  // Filters
  const [filters, setFilters] = useState({
    requireOxygen: false,
    requireICU: false,
    anomaliesOnly: false,
  });
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);

  // Load data from JSON files on mount
  useEffect(() => {
    Promise.all([
      fetch('/data/facilities.json').then((r) => r.json()),
      fetch('/data/analysis.json').then((r) => r.json()),
    ])
      .then(([rawFacilities, analysis]) => {
        const mapped = (rawFacilities as JsonFacility[]).map(mapJsonToFacility);
        setFacilities(mapped);
        setAnalysisData(analysis);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load data:', err);
        setIsLoading(false);
      });
  }, []);

  // Derive FacilityWithDerived from Facility[]
  const derivedFacilities = useMemo<FacilityWithDerived[]>(
    () => facilities.map((facility) => ({ ...facility, flags: [], highlightFields: [] })),
    [facilities]
  );

  // Apply filters
  const baseFacilities = agentResult?.facilities ?? derivedFacilities;
  const filteredFacilities = useMemo(() => {
    return baseFacilities.filter((facility) => {
      if (filters.anomaliesOnly && facility.flags.length === 0) return false;
      if (filters.requireOxygen) {
        const hasOxygen =
          (facility.equipment ?? '').toLowerCase().includes('oxygen') ||
          (facility.capabilities ?? '').toLowerCase().includes('oxygen');
        if (!hasOxygen) return false;
      }
      if (filters.requireICU) {
        const hasIcu = (facility.capabilities ?? '').toLowerCase().includes('icu');
        if (!hasIcu) return false;
      }
      if (selectedSpecialties.length) {
        const hay =
          `${facility.specialties ?? ''} ${facility.capabilities ?? ''} ${facility.services ?? ''}`.toLowerCase();
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

  const layerData = useMemo(
    () => getMapLayers(filteredFacilities, selectedSpecialties),
    [filteredFacilities, selectedSpecialties]
  );

  const facilitiesInBounds = useMemo(() => {
    return filteredFacilities.filter((facility) => {
      const lat =
        facility.latitude ?? getPseudoCoordinates(facility.id, facility.region).lat;
      const lng =
        facility.longitude ?? getPseudoCoordinates(facility.id, facility.region).lng;
      return isInBounds(lat, lng, mapBounds);
    });
  }, [filteredFacilities, mapBounds]);

  const regionInsights = useMemo(
    () => generateRegionInsights(filteredFacilities),
    [filteredFacilities]
  );

  const selectedFacility = useMemo(() => {
    return filteredFacilities.find((facility) => facility.id === selectedFacilityId) ?? null;
  }, [filteredFacilities, selectedFacilityId]);

  const facilityInsights = useMemo(() => {
    if (!selectedFacility) return [];
    return generateFacilityInsights(selectedFacility);
  }, [selectedFacility]);

  // Submit query - calls real backend API + local agent for enrichment
  const handleSubmitQuery = useCallback(
    async (question: string) => {
      if (!facilities.length || chatLoading) return;

      setChatLoading(true);
      const userMsg: ChatMessage = {
        id: randomId('user'),
        role: 'user',
        content: question,
      };
      setMessages((prev) => [...prev, userMsg]);
      setQueryText('');

      try {
        // Call real backend API
        const res = await fetch(`${API_URL}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();

        // Match facility names from API response
        const apiNames: string[] = data.facility_names || [];
        const matched = matchFacilityNames(apiNames, derivedFacilities);
        setHighlightedFacilityIds(matched);

        // Select first matched facility
        if (matched.size > 0) {
          const firstId = [...matched][0];
          setSelectedFacilityId(firstId);
        }

        // Run local agent for enrichment (citations, trace, metrics)
        const query: AgentQuery = { text: question, mode: 'simple', filters: {} };
        const localResult = runAgent(query, facilities);
        setAgentResult(localResult);

        // Create assistant message with API response + metadata
        const assistantMsg: ChatMessage = {
          id: randomId('assistant'),
          role: 'assistant',
          content: data.synthesis || localResult.summary || 'No response generated.',
          metadata: {
            intent: data.intent,
            agents: data.required_agents,
            citations: data.citations,
            elapsed: data.elapsed,
            facilityNames: apiNames,
          },
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: any) {
        // Fallback to local agent if API fails
        console.warn('Backend API unavailable, using local agent:', err.message);
        const query: AgentQuery = { text: question, mode: 'simple', filters: {} };
        const localResult = runAgent(query, facilities);
        setAgentResult(localResult);

        // Highlight local agent results
        const matchedIds = new Set(localResult.facilities.map((f) => f.id));
        setHighlightedFacilityIds(matchedIds);
        if (localResult.facilities.length > 0) {
          setSelectedFacilityId(localResult.facilities[0].id);
        }

        const assistantMsg: ChatMessage = {
          id: randomId('assistant'),
          role: 'assistant',
          content: localResult.summary,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } finally {
        setChatLoading(false);
      }
    },
    [facilities, derivedFacilities, chatLoading]
  );

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

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-accent-blue/30 border-t-accent-blue" />
          <p className="text-lg font-medium text-[color:var(--text-muted)]">
            Loading Ghana healthcare data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg-base)] px-4 py-6 text-[color:var(--text-primary)]">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left panel - Chat */}
        <div className="h-[calc(100vh-3rem)]">
          <ChatPanel
            queryText={queryText}
            onQueryChange={setQueryText}
            onSubmit={handleSubmitQuery}
            messages={messages}
            suggestions={SUGGESTIONS}
            agentResult={agentResult}
            onOpenCitations={() => setCitationsOpen(true)}
            onOpenTrace={() => setTraceOpen(true)}
            onOpenPlan={generatePlanFromInsights}
            onOpenInsights={() => setInsightsOpen(true)}
            selectedFacility={
              selectedFacility
                ? {
                    name: selectedFacility.name,
                    region: selectedFacility.region,
                    type: selectedFacility.type,
                  }
                : null
            }
            isLoading={chatLoading}
            highlightedCount={highlightedFacilityIds.size}
          />
        </div>

        {/* Right panel - Map + Facility list */}
        <div className="flex h-[calc(100vh-3rem)] flex-col gap-4">
          <div className="flex-1 rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-3">
            <LivingMap
              facilities={filteredFacilities}
              layerData={layerData}
              selectedFacilityId={selectedFacilityId}
              onSelectFacility={setSelectedFacilityId}
              onBoundsChange={setMapBounds}
              specialtyOptions={SPECIALTY_OPTIONS}
              selectedSpecialties={selectedSpecialties}
              onSelectSpecialties={setSelectedSpecialties}
              highlightedFacilityIds={highlightedFacilityIds}
              analysisData={analysisData}
            />
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
              onToggleFilter={(key) =>
                setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
              }
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
                      onAction: () =>
                        setFilters({
                          requireOxygen: false,
                          requireICU: false,
                          anomaliesOnly: false,
                        }),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Drawers */}
      <FacilityDrawer
        facility={selectedFacility}
        allFacilities={baseFacilities}
        citations={agentResult?.citations ?? []}
        insights={facilityInsights}
        onClose={() => setSelectedFacilityId(null)}
      />

      <CitationsDrawer
        isOpen={citationsOpen}
        onClose={() => setCitationsOpen(false)}
        citations={agentResult?.citations ?? []}
      />
      <TraceDrawer
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
        trace={agentResult?.trace ?? []}
      />
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
