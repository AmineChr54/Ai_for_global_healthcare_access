"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import LayerPanel from "./components/LayerPanel";
import ChatPanel from "./components/ChatPanel";

// Dynamic import for Leaflet (no SSR)
const MapView = dynamic(() => import("./components/MapView"), { ssr: false });

export interface Facility {
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

export interface Analysis {
  medicalDeserts: { city: string; lat: number; lon: number; nearestHospitalKm: number | null; population: number | null }[];
  coverageGrid: { lat: number; lon: number; coverageIndex: number; facilityCount: number }[];
  regionStats: Record<string, any>;
  specialtyDistribution: Record<string, { total: number; regions: Record<string, number> }>;
  regionPopulation: Record<string, number>;
  whoGuidelines: Record<string, number>;
  ghanaHealthStats: Record<string, any>;
}

export interface LayerState {
  showFacilities: boolean;
  showDeserts: boolean;
  showCoverage: boolean;
  showPopulation: boolean;
  showNgos: boolean;
  coverageRadius: number;
  populationThreshold: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: {
    intent?: string;
    agents?: string[];
    citations?: any[];
    elapsed?: number;
    facilityNames?: string[];
  };
}

export interface QueryFilters {
  specialty?: string;
  types?: string[];
}

export default function Home() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(["hospital", "clinic", "doctor", "pharmacy", "dentist"])
  );
  const [showNgos, setShowNgos] = useState(true);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);

  // Chat + highlight state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [highlightedNames, setHighlightedNames] = useState<Set<string>>(new Set());

  const [layers, setLayers] = useState<LayerState>({
    showFacilities: true,
    showDeserts: false,
    showCoverage: false,
    showPopulation: false,
    showNgos: false,
    coverageRadius: 50,
    populationThreshold: 50000,
  });

  useEffect(() => {
    Promise.all([
      fetch("/data/facilities.json").then((r) => r.json()),
      fetch("/data/analysis.json").then((r) => r.json()),
    ]).then(([facs, ana]) => {
      setFacilities(facs);
      setAnalysis(ana);
      setLoading(false);
    });
  }, []);

  // Clear highlights
  const clearHighlights = useCallback(() => {
    setHighlightedNames(new Set());
  }, []);

  const applyQueryFilters = useCallback((filters: QueryFilters) => {
    // Set specialty filter (or clear it if the query doesn't mention one)
    setSelectedSpecialty(filters.specialty || "");

    // Set type filter: if the query mentions specific types, restrict to those;
    // otherwise reset to show all types
    if (filters.types && filters.types.length > 0) {
      setSelectedTypes(new Set(filters.types));
    } else {
      setSelectedTypes(new Set(["hospital", "clinic", "doctor", "pharmacy", "dentist"]));
    }
  }, []);

  // Filtered facilities
  const filtered = facilities.filter((f) => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.city.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedSpecialty && !f.specialties.includes(selectedSpecialty)) return false;
    if (f.orgType === "ngo") return showNgos;
    if (f.type && !selectedTypes.has(f.type)) return false;
    return true;
  });

  const allSpecialties = analysis
    ? Object.entries(analysis.specialtyDistribution)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([k]) => k)
    : [];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 mx-auto animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-lg font-medium text-gray-600">Loading Ghana healthcare data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar
        facilities={filtered}
        allFacilities={facilities}
        search={search}
        onSearch={setSearch}
        selectedSpecialty={selectedSpecialty}
        onSpecialtyChange={setSelectedSpecialty}
        allSpecialties={allSpecialties}
        selectedTypes={selectedTypes}
        onTypesChange={setSelectedTypes}
        showNgos={showNgos}
        onNgosChange={setShowNgos}
        selectedFacility={selectedFacility}
        onSelectFacility={setSelectedFacility}
        analysis={analysis}
        highlightedNames={highlightedNames}
        onClearHighlights={clearHighlights}
      />

      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          facilities={filtered}
          analysis={analysis}
          layers={layers}
          selectedSpecialty={selectedSpecialty}
          selectedFacility={selectedFacility}
          onSelectFacility={setSelectedFacility}
          highlightedNames={highlightedNames}
        />

        {/* Bottom buttons */}
        <div className="absolute bottom-6 right-6 z-[1000] flex gap-2">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`rounded-full px-5 py-2.5 shadow-lg border flex items-center gap-2 transition-colors ${
              chatOpen
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            Ask Agent
          </button>
          <button
            onClick={() => setLayerPanelOpen(!layerPanelOpen)}
            className={`rounded-full px-5 py-2.5 shadow-lg border flex items-center gap-2 transition-colors ${
              layerPanelOpen
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            Layers
          </button>
        </div>

        {/* Chat panel (floating over map) */}
        {chatOpen && (
          <ChatPanel
            messages={chatMessages}
            onMessagesChange={setChatMessages}
            facilities={facilities}
            onHighlight={setHighlightedNames}
            onSelectFacility={setSelectedFacility}
            onApplyFilters={applyQueryFilters}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>

      {/* Right Layer Panel */}
      {layerPanelOpen && (
        <LayerPanel
          layers={layers}
          onLayersChange={setLayers}
          onClose={() => setLayerPanelOpen(false)}
          analysis={analysis}
        />
      )}
    </div>
  );
}
