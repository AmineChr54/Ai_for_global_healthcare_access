"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useMemo } from "react";
import ChatPanel from "./components/ChatPanel";
import FacilitiesPanel from "./components/FacilitiesPanel";
import SearchBar from "./components/SearchBar";
import CoverageInfoCard from "./components/CoverageInfoCard";
import type {
  Facility,
  Analysis,
  LayerState,
  ChatMessage,
  QueryFilters,
  CategorySubFilters,
} from "@/types";
import { EMPTY_SUB_FILTERS } from "@/types";

// Dynamic import for Leaflet (no SSR)
const MapView = dynamic(() => import("./components/MapView"), { ssr: false });

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
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(
    null
  );
  const [equipmentFilters, setEquipmentFilters] = useState<Set<string>>(
    new Set()
  );
  const [subFilters, setSubFilters] =
    useState<CategorySubFilters>(EMPTY_SUB_FILTERS);

  // Chat + highlight state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [highlightedNames, setHighlightedNames] = useState<Set<string>>(
    new Set()
  );
  const [chatFilterActive, setChatFilterActive] = useState(false);

  // Layer state
  const [layers, setLayers] = useState<LayerState>({
    showFacilities: true,
    showDeserts: false,
    showCoverage: false,
    showPopulation: false,
    showNgos: false,
    coverageRadius: 50,
    populationThreshold: 50000,
  });
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);

  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/facilities.json").then((r) => {
        if (!r.ok)
          throw new Error(`Failed to load facilities.json (${r.status})`);
        return r.json();
      }),
      fetch("/data/analysis.json").then((r) => {
        if (!r.ok)
          throw new Error(`Failed to load analysis.json (${r.status})`);
        return r.json();
      }),
    ])
      .then(([facs, ana]) => {
        setFacilities(facs);
        setAnalysis(ana);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Data loading error:", err);
        setDataError(err.message);
        setLoading(false);
      });
  }, []);

  const clearHighlights = useCallback(() => {
    setHighlightedNames(new Set());
    setChatFilterActive(false);
  }, []);

  // When the chat returns facility names, activate exclusive filter mode
  const handleChatHighlight = useCallback((names: Set<string>) => {
    setHighlightedNames(names);
    setChatFilterActive(names.size > 0);
  }, []);

  const applyQueryFilters = useCallback((filters: QueryFilters) => {
    setSelectedSpecialty(filters.specialty || "");
    if (filters.types && filters.types.length > 0) {
      setSelectedTypes(new Set(filters.types));
    } else {
      setSelectedTypes(
        new Set(["hospital", "clinic", "doctor", "pharmacy", "dentist"])
      );
    }
  }, []);

  // Filterable facility types (others or empty type always shown so "all" really shows all)
  const FILTERABLE_TYPES = useMemo(
    () => new Set(["hospital", "clinic", "doctor", "pharmacy", "dentist"]),
    []
  );

  // Filtered facilities
  const filtered = useMemo(() => {
    // When the AI returns specific facilities, show ONLY those on the map
    if (chatFilterActive && highlightedNames.size > 0) {
      return facilities.filter((f) => highlightedNames.has(f.name));
    }

    return facilities.filter((f) => {
      if (
        search &&
        !f.name.toLowerCase().includes(search.toLowerCase()) &&
        !f.city.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (selectedSpecialty && !f.specialties.includes(selectedSpecialty))
        return false;
      if (f.orgType === "ngo") return showNgos;
      // Only filter by type when facility has a filterable type; others/empty always pass
      if (
        f.type &&
        FILTERABLE_TYPES.has(f.type) &&
        !selectedTypes.has(f.type)
      )
        return false;

      // Equipment filters
      if (equipmentFilters.size > 0) {
        const equipLower = [
          ...f.equipment.map((e) => e.toLowerCase()),
          ...f.capabilities.map((c) => c.toLowerCase()),
        ];
        if (equipmentFilters.has("oxygen")) {
          if (!equipLower.some((e) => e.includes("oxygen"))) return false;
        }
        if (equipmentFilters.has("icu")) {
          if (
            !equipLower.some(
              (e) =>
                e.includes("icu") ||
                e.includes("intensive care") ||
                e.includes("critical care")
            )
          )
            return false;
        }
        if (equipmentFilters.has("anomalies")) {
          const hasSpecialties = f.specialties.length > 0;
          const hasEquipment = f.equipment.length > 0;
          if (!(hasSpecialties && !hasEquipment)) return false;
        }
      }

      // Sub-filters (from per-category drill-down)
      if (subFilters.operator && f.operator !== subFilters.operator)
        return false;
      if (
        subFilters.regions.size > 0 &&
        !subFilters.regions.has(f.region)
      )
        return false;
      if (
        subFilters.procedures.size > 0 &&
        !f.procedures.some((p) => subFilters.procedures.has(p))
      )
        return false;
      if (
        subFilters.equipment.size > 0 &&
        !f.equipment.some((e) => subFilters.equipment.has(e))
      )
        return false;
      if (
        subFilters.capabilities.size > 0 &&
        !f.capabilities.some((c) => subFilters.capabilities.has(c))
      )
        return false;
      if (subFilters.hasDoctors === true && (f.doctors === null || f.doctors === 0))
        return false;
      if (subFilters.hasDoctors === false && f.doctors !== null && f.doctors > 0)
        return false;
      if (subFilters.hasBeds === true && (f.beds === null || f.beds === 0))
        return false;
      if (subFilters.hasBeds === false && f.beds !== null && f.beds > 0)
        return false;

      return true;
    });
  }, [
    facilities,
    search,
    selectedSpecialty,
    selectedTypes,
    showNgos,
    equipmentFilters,
    subFilters,
    chatFilterActive,
    highlightedNames,
  ]);

  const allSpecialties = useMemo(() => {
    if (!analysis) return [];
    return Object.entries(analysis.specialtyDistribution)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([k]) => k);
  }, [analysis]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080c14]">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 mx-auto animate-spin rounded-full border-4 border-[#1c2a3a] border-t-[#2dd4bf]" />
          <p className="text-sm font-medium text-[#5a6577]">
            Loading Ghana healthcare data...
          </p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080c14]">
        <div className="text-center max-w-md p-8 bg-[#0f1623] rounded-2xl border border-[#1c2a3a]">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-white mb-2">
            Data Files Missing
          </h2>
          <p className="text-sm text-[#8b97a8] mb-4">{dataError}</p>
          <div className="bg-[#080c14] text-[#8b97a8] rounded-lg p-4 text-left text-xs font-mono border border-[#1c2a3a]">
            <p className="text-[#5a6577] mb-1">
              # Generate the required data files:
            </p>
            <p className="text-[#2dd4bf]">python scripts/prepare_map_data.py</p>
            <p className="text-[#5a6577] mt-3 mb-1"># Then restart the frontend:</p>
            <p className="text-[#2dd4bf]">cd map && npm run dev</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#080c14] flex gap-3 p-3 overflow-hidden">
      {/* Left: Chat Panel */}
      <ChatPanel
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        facilities={facilities}
        onHighlight={handleChatHighlight}
        onSelectFacility={setSelectedFacility}
        onApplyFilters={applyQueryFilters}
        onOpenSettings={() => setLayerPanelOpen(!layerPanelOpen)}
      />

      {/* Right: Map + Facilities Panel */}
      <div className="flex-1 flex min-w-0 relative">
        {/* Map area — takes full space */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-[#1c2a3a]">
          <MapView
            facilities={filtered}
            analysis={analysis}
            layers={layers}
            selectedSpecialty={selectedSpecialty}
            selectedFacility={selectedFacility}
            onSelectFacility={setSelectedFacility}
            highlightedNames={highlightedNames}
          />

          {/* Floating search bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
            <SearchBar
              search={search}
              onSearchChange={setSearch}
              selectedSpecialty={selectedSpecialty}
              onSpecialtyChange={setSelectedSpecialty}
              allSpecialties={allSpecialties}
            />
          </div>

          {/* Coverage info card */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[999]">
            <CoverageInfoCard analysis={analysis} facilities={filtered} />
          </div>

          {/* Floating layers button — bottom right */}
          <button
            onClick={() => setLayerPanelOpen(!layerPanelOpen)}
            className={`absolute bottom-4 right-4 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg transition-all ${
              layerPanelOpen
                ? "bg-[#2dd4bf] border-[#2dd4bf] text-[#080c14]"
                : "bg-[#0f1623]/90 backdrop-blur-sm border-[#1c2a3a] text-[#8b97a8] hover:text-white hover:border-[#263348]"
            }`}
            title="Toggle layers"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l4.179 2.25L12 22.5l-9.75-5.25 4.179-2.25"
              />
            </svg>
            <span className="text-sm font-medium">Layers</span>
          </button>

          {/* Floating layer panel — bottom right, above button */}
          {layerPanelOpen && (
            <div className="absolute bottom-16 right-4 z-[1000] w-64 bg-[#0f1623]/95 backdrop-blur-md border border-[#1c2a3a] rounded-xl p-4 shadow-2xl">
              <h3 className="text-xs font-semibold tracking-wider uppercase text-[#5a6577] mb-3">
                Map Layers
              </h3>

              <div className="space-y-2.5">
                <LayerToggle
                  label="Facility Markers"
                  checked={layers.showFacilities}
                  onChange={(v) =>
                    setLayers({ ...layers, showFacilities: v })
                  }
                  color="#2dd4bf"
                />
                <LayerToggle
                  label="Medical Deserts"
                  checked={layers.showDeserts}
                  onChange={(v) =>
                    setLayers({ ...layers, showDeserts: v })
                  }
                  color="#ef4444"
                />
                <LayerToggle
                  label="Hospital Coverage"
                  checked={layers.showCoverage}
                  onChange={(v) =>
                    setLayers({ ...layers, showCoverage: v })
                  }
                  color="#22c55e"
                />
                <LayerToggle
                  label="Population Underserved"
                  checked={layers.showPopulation}
                  onChange={(v) =>
                    setLayers({ ...layers, showPopulation: v })
                  }
                  color="#f59e0b"
                />
              </div>

              {layers.showPopulation && (
                <div className="mt-3 pt-3 border-t border-[#1c2a3a]">
                  <div className="flex justify-between text-[11px] text-[#6b7a8d] mb-1">
                    <span>Population Threshold</span>
                    <span className="font-mono text-[#8b97a8]">
                      {(layers.populationThreshold / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10000}
                    max={200000}
                    step={5000}
                    value={layers.populationThreshold}
                    onChange={(e) =>
                      setLayers({
                        ...layers,
                        populationThreshold: Number(e.target.value),
                      })
                    }
                    className="w-full"
                  />
                </div>
              )}

              {/* Stats */}
              {analysis && (
                <div className="mt-3 pt-3 border-t border-[#1c2a3a] grid grid-cols-2 gap-2">
                  <div className="bg-[#151d2e] rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-[#5a6577]">
                      Facilities
                    </div>
                    <div className="text-sm font-bold text-white">
                      {Object.values(analysis.regionStats).reduce(
                        (s: number, r: any) => s + r.facilities,
                        0
                      )}
                    </div>
                  </div>
                  <div className="bg-[#151d2e] rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-[#5a6577]">
                      Deserts
                    </div>
                    <div className="text-sm font-bold text-[#ef4444]">
                      {analysis.medicalDeserts.length}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat filter banner */}
          {highlightedNames.size > 0 && (
            <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-3 px-4 py-2.5 bg-[#0f1623]/95 backdrop-blur-md border border-[#f59e0b]/30 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
              <span className="text-xs text-[#f59e0b] font-medium">
                {chatFilterActive
                  ? `Showing ${highlightedNames.size} AI results`
                  : `${highlightedNames.size} facilities highlighted`}
              </span>
              {chatFilterActive && (
                <button
                  onClick={() => setChatFilterActive(false)}
                  className="text-[11px] text-[#2dd4bf] hover:text-[#5eead4] px-2 py-0.5 rounded-md bg-[#2dd4bf]/10 hover:bg-[#2dd4bf]/20 transition-colors font-medium"
                >
                  Show All
                </button>
              )}
              <button
                onClick={clearHighlights}
                className="text-[11px] text-[#8b97a8] hover:text-white px-2 py-0.5 rounded-md bg-[#1a2538] hover:bg-[#263348] transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Facilities Panel — vertical, right side, collapsible */}
        <FacilitiesPanel
          facilities={filtered}
          allFacilities={facilities}
          analysis={analysis}
          highlightedNames={highlightedNames}
          selectedSpecialty={selectedSpecialty}
          onSpecialtyChange={setSelectedSpecialty}
          allSpecialties={allSpecialties}
          equipmentFilters={equipmentFilters}
          onEquipmentFiltersChange={setEquipmentFilters}
          selectedTypes={selectedTypes}
          onSelectedTypesChange={setSelectedTypes}
          showNgos={showNgos}
          onShowNgosChange={setShowNgos}
          chatFilterActive={chatFilterActive}
          onClearChatFilter={clearHighlights}
          subFilters={subFilters}
          onSubFiltersChange={setSubFilters}
        />
      </div>
    </div>
  );
}

/* ─── Small layer toggle component ─── */
function LayerToggle({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 w-full group"
    >
      <div
        className="w-8 h-[18px] rounded-full transition-all relative shrink-0"
        style={{
          backgroundColor: checked ? color : "#1c2a3a",
        }}
      >
        <div
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[16px]" : "translate-x-[2px]"
          }`}
        />
      </div>
      <span
        className={`text-xs transition-colors ${
          checked ? "text-white" : "text-[#6b7a8d] group-hover:text-[#8b97a8]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
