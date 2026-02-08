"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Facility, Analysis, CategorySubFilters } from "@/types";
import { EMPTY_SUB_FILTERS } from "@/types";

/* ─── Category config ─── */

interface CategoryConfig {
  key: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}

/** Types that have their own category; others count as Uncategorized */
const STANDARD_TYPE_KEYS = new Set(["hospital", "clinic", "doctor", "pharmacy", "dentist"]);

const FACILITY_CATEGORIES: CategoryConfig[] = [
  {
    key: "hospital",
    label: "Hospitals",
    color: "#3b82f6",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" />
      </svg>
    ),
  },
  {
    key: "clinic",
    label: "Clinics",
    color: "#22c55e",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
      </svg>
    ),
  },
  {
    key: "doctor",
    label: "Doctors",
    color: "#a855f7",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
      </svg>
    ),
  },
  {
    key: "pharmacy",
    label: "Pharmacies",
    color: "#f97316",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.594 6.376a1.125 1.125 0 01-1.093.874H7.688a1.125 1.125 0 01-1.094-.874L5 14.5m14 0H5" />
      </svg>
    ),
  },
  {
    key: "dentist",
    label: "Dentists",
    color: "#2dd4bf",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    key: "other",
    label: "Uncategorized",
    color: "#6b7280",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
];

const EQUIPMENT_FILTERS = [
  { key: "oxygen", label: "Oxygen Supply", color: "#38bdf8" },
  { key: "icu", label: "ICU / Critical Care", color: "#f472b6" },
  { key: "anomalies", label: "Data Anomalies", color: "#fbbf24" },
];

/* ─── Insight generation ─── */

interface RegionInsight {
  title: string;
  description: string;
  nextStep: string;
  score: number;
  facilities: string[];
  region: string;
  specialty: string;
}

function generateInsights(
  analysis: Analysis,
  allFacilities: Facility[]
): RegionInsight[] {
  const insights: RegionInsight[] = [];

  for (const [specialty, data] of Object.entries(
    analysis.specialtyDistribution
  )) {
    for (const [region, count] of Object.entries(data.regions)) {
      const regionPop = analysis.regionPopulation[region] || 0;

      if (count < 15 && regionPop > 200000) {
        const popFactor = Math.min(regionPop / 500000, 1);
        const coveragePenalty = Math.max(0, 1 - count / 10);
        const score = Math.min(
          95,
          Math.max(40, Math.round(popFactor * 50 + coveragePenalty * 45))
        );

        const relatedFacilities = allFacilities
          .filter(
            (f) =>
              f.region?.toLowerCase().includes(region.toLowerCase()) ||
              region.toLowerCase().includes(f.region?.toLowerCase() || "")
          )
          .filter((f) => f.specialties.includes(specialty))
          .slice(0, 3)
          .map((f) => f.name);

        insights.push({
          title: `${region} could benefit from added ${specialty} coverage`,
          description: `Only ${count} facilities list specialties here, with limited ${specialty} signals across nearby providers.`,
          nextStep: `Next: Validate ${specialty} capacity and recruit partner clinics for coverage expansion.`,
          score,
          facilities:
            relatedFacilities.length > 0
              ? relatedFacilities
              : allFacilities
                  .filter(
                    (f) =>
                      f.region
                        ?.toLowerCase()
                        .includes(region.toLowerCase()) ||
                      region
                        .toLowerCase()
                        .includes(f.region?.toLowerCase() || "")
                  )
                  .slice(0, 3)
                  .map((f) => f.name),
          region,
          specialty,
        });
      }
    }
  }

  return insights
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

/* ─── Per-category data availability ─── */

interface CategoryFilterOptions {
  operators: string[];
  regions: string[];
  procedures: string[];
  equipment: string[];
  capabilities: string[];
  hasDoctorsData: boolean;
  hasBedsData: boolean;
}

function computeCategoryOptions(
  allFacilities: Facility[],
  categoryKey: string
): CategoryFilterOptions {
  const facs =
    categoryKey === "ngo"
      ? allFacilities.filter((f) => f.orgType === "ngo")
      : categoryKey === "other"
      ? allFacilities.filter(
          (f) => f.orgType !== "ngo" && (!f.type || !STANDARD_TYPE_KEYS.has(f.type))
        )
      : allFacilities.filter(
          (f) => f.type === categoryKey && f.orgType !== "ngo"
        );

  const operatorSet = new Set<string>();
  const regionSet = new Set<string>();
  const procedureSet = new Set<string>();
  const equipmentSet = new Set<string>();
  const capabilitySet = new Set<string>();
  let hasDoctorsData = false;
  let hasBedsData = false;

  for (const f of facs) {
    if (f.operator) operatorSet.add(f.operator);
    if (f.region) regionSet.add(f.region);
    for (const p of f.procedures) procedureSet.add(p);
    for (const e of f.equipment) equipmentSet.add(e);
    for (const c of f.capabilities) capabilitySet.add(c);
    if (f.doctors !== null && f.doctors > 0) hasDoctorsData = true;
    if (f.beds !== null && f.beds > 0) hasBedsData = true;
  }

  return {
    operators: Array.from(operatorSet).sort(),
    regions: Array.from(regionSet).sort(),
    procedures: Array.from(procedureSet).sort(),
    equipment: Array.from(equipmentSet).sort(),
    capabilities: Array.from(capabilitySet).sort(),
    hasDoctorsData,
    hasBedsData,
  };
}

/* ─── Sub-filter chip list with search ─── */

function ChipFilter({
  label,
  items,
  selected,
  onToggle,
  accentColor,
}: {
  label: string;
  items: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  accentColor: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? items.filter((i) => i.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#5a6577] mb-1.5">
        {label}
      </div>
      {items.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="w-full text-[11px] px-2 py-1 mb-1.5 rounded bg-[#0a0f1a] border border-[#1c2a3a] text-[#8b97a8] placeholder-[#3a4556] focus:outline-none focus:border-[#2dd4bf]/30"
        />
      )}
      <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto chip-scroll">
        {filtered.length === 0 && (
          <span className="text-[10px] text-[#3a4556] italic">No matches</span>
        )}
        {filtered.map((item) => {
          const active = selected.has(item);
          return (
            <button
              key={item}
              onClick={() => onToggle(item)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all truncate max-w-[200px] ${
                active
                  ? "border-current text-current bg-current/10 font-medium"
                  : "border-[#1c2a3a] text-[#6b7a8d] bg-[#0a0f1a] hover:border-[#3a4556] hover:text-[#8b97a8]"
              }`}
              style={active ? { color: accentColor } : undefined}
              title={item}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Props ─── */

interface Props {
  facilities: Facility[];
  allFacilities: Facility[];
  analysis: Analysis | null;
  highlightedNames: Set<string>;
  selectedSpecialty: string;
  onSpecialtyChange: (v: string) => void;
  allSpecialties: string[];
  equipmentFilters: Set<string>;
  onEquipmentFiltersChange: (v: Set<string>) => void;
  selectedTypes: Set<string>;
  onSelectedTypesChange: (v: Set<string>) => void;
  showNgos: boolean;
  onShowNgosChange: (v: boolean) => void;
  chatFilterActive: boolean;
  onClearChatFilter: () => void;
  subFilters: CategorySubFilters;
  onSubFiltersChange: (v: CategorySubFilters) => void;
  selectedFacility: Facility | null;
  onSelectFacility: (f: Facility | null) => void;
}

/* ─── Component ─── */

export default function FacilitiesPanel({
  facilities,
  allFacilities,
  analysis,
  highlightedNames,
  selectedSpecialty,
  onSpecialtyChange,
  allSpecialties,
  equipmentFilters,
  onEquipmentFiltersChange,
  selectedTypes,
  onSelectedTypesChange,
  showNgos,
  onShowNgosChange,
  chatFilterActive,
  onClearChatFilter,
  subFilters,
  onSubFiltersChange,
  selectedFacility,
  onSelectFacility,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"filters" | "facility">("filters");
  const [institutionsOpen, setInstitutionsOpen] = useState(true);

  /* When a facility is selected (e.g. from map), switch to Facility info tab */
  useEffect(() => {
    if (selectedFacility) setRightTab("facility");
  }, [selectedFacility?.uid]);

  /* When AI/chat filter is active, sync the filters view: use only types/specialty represented in the filtered set, and update counts */
  const facilitiesForCounts = chatFilterActive ? facilities : allFacilities;
  useEffect(() => {
    if (!chatFilterActive || facilities.length === 0) return;
    const list = facilities;
    const typesPresent = new Set<string>();
    for (const cat of FACILITY_CATEGORIES) {
      if (cat.key === "other") {
        const n = list.filter(
          (f) => f.orgType !== "ngo" && (!f.type || !STANDARD_TYPE_KEYS.has(f.type))
        ).length;
        if (n > 0) typesPresent.add("other");
      } else {
        const n = list.filter(
          (f) => f.type === cat.key && f.orgType !== "ngo"
        ).length;
        if (n > 0) typesPresent.add(cat.key);
      }
    }
    const ngoCount = list.filter((f) => f.orgType === "ngo").length;
    onSelectedTypesChange(typesPresent);
    onShowNgosChange(ngoCount > 0);
    const allSpecs = list.flatMap((f) => f.specialties || []);
    if (allSpecs.length > 0) {
      const bySpec: Record<string, number> = {};
      for (const s of allSpecs) {
        bySpec[s] = (bySpec[s] ?? 0) + 1;
      }
      const best = Object.entries(bySpec).sort((a, b) => b[1] - a[1])[0];
      if (best) onSpecialtyChange(best[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when AI filter or filtered set changes
  }, [chatFilterActive, facilities]);

  /* Scroll list to selected facility when selection changes (e.g. from map click) */
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selectedFacility && rightTab === "facility") {
      selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedFacility?.uid, rightTab]);

  /* Fixed order for facility list: by name, then city, then region */
  const sortedFacilities = useMemo(() => {
    return [...facilities].sort((a, b) => {
      const n = (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
      if (n !== 0) return n;
      const c = (a.city || "").localeCompare(b.city || "", undefined, { sensitivity: "base" });
      if (c !== 0) return c;
      return (a.region || "").localeCompare(b.region || "", undefined, { sensitivity: "base" });
    });
  }, [facilities]);

  /* Tell Leaflet (and any other layout-dependent widget) to recalculate
     after the panel collapse/expand CSS transition (300ms). */
  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
    // Fire during transition so the map repaints progressively
    const t1 = setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    const t2 = setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
    // Fire after transition completes (300ms in CSS)
    const t3 = setTimeout(() => window.dispatchEvent(new Event("resize")), 350);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const insights = useMemo(() => {
    if (!analysis) return [];
    return generateInsights(analysis, allFacilities);
  }, [analysis, allFacilities]);

  /* counts per category — when AI filter is active, show counts for the filtered set */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const source = facilitiesForCounts;
    for (const cat of FACILITY_CATEGORIES) {
      if (cat.key === "other") {
        counts["other"] = source.filter(
          (f) => f.orgType !== "ngo" && (!f.type || !STANDARD_TYPE_KEYS.has(f.type))
        ).length;
      } else {
        counts[cat.key] = source.filter(
          (f) => f.type === cat.key && f.orgType !== "ngo"
        ).length;
      }
    }
    counts["ngo"] = source.filter((f) => f.orgType === "ngo").length;
    return counts;
  }, [facilitiesForCounts]);

  /* available sub-filter options per category — when AI filter active, options reflect filtered set */
  const categoryOptions = useMemo(() => {
    const opts: Record<string, CategoryFilterOptions> = {};
    const source = facilitiesForCounts;
    for (const cat of FACILITY_CATEGORIES) {
      opts[cat.key] = computeCategoryOptions(source, cat.key);
    }
    opts["ngo"] = computeCategoryOptions(source, "ngo");
    return opts;
  }, [facilitiesForCounts]);

  /* count of active sub-filters */
  const activeSubFilterCount = useMemo(() => {
    let count = 0;
    if (subFilters.operator) count++;
    if (subFilters.regions.size > 0) count++;
    if (subFilters.procedures.size > 0) count++;
    if (subFilters.equipment.size > 0) count++;
    if (subFilters.capabilities.size > 0) count++;
    if (subFilters.hasDoctors !== null) count++;
    if (subFilters.hasBeds !== null) count++;
    return count;
  }, [subFilters]);

  const toggleType = (key: string) => {
    const next = new Set(selectedTypes);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedTypesChange(next);
  };

  const toggleEquipment = (key: string) => {
    const next = new Set(equipmentFilters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onEquipmentFiltersChange(next);
  };

  const clearAll = () => {
    onSelectedTypesChange(
      new Set(["hospital", "clinic", "doctor", "pharmacy", "dentist", "other"])
    );
    onShowNgosChange(true);
    onEquipmentFiltersChange(new Set());
    onSpecialtyChange("");
    onClearChatFilter();
    onSubFiltersChange(EMPTY_SUB_FILTERS);
    setExpandedCategory(null);
  };

  const toggleSubFilterSet = (
    field: "regions" | "procedures" | "equipment" | "capabilities",
    value: string
  ) => {
    const next = new Set(subFilters[field]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onSubFiltersChange({ ...subFilters, [field]: next });
  };

  const visibleCount = facilities.length;
  const highlightCount = highlightedNames.size;

  const formatCount = (n: number) => (n > 200 ? "200+" : String(n));

  /* ─── Render sub-filter panel for a category ─── */
  const renderSubFilters = (categoryKey: string, color: string) => {
    const opts = categoryOptions[categoryKey];
    if (!opts) return null;

    const hasAnyFilter =
      opts.operators.length > 1 ||
      opts.regions.length > 1 ||
      opts.procedures.length > 0 ||
      opts.equipment.length > 0 ||
      opts.capabilities.length > 0 ||
      opts.hasDoctorsData ||
      opts.hasBedsData;

    if (!hasAnyFilter) {
      return (
        <div className="sub-filter-enter px-3 py-2 ml-6 mb-1 rounded-lg bg-[#0a0f1a] border-l-2 text-[11px] text-[#5a6577] italic" style={{ borderColor: color }}>
          No additional filters available
        </div>
      );
    }

    return (
      <div
        className="sub-filter-enter ml-6 mb-1 px-3 py-2.5 rounded-lg bg-[#0a0f1a] border-l-2 space-y-3"
        style={{ borderColor: color }}
      >
        {/* Operator toggle */}
        {opts.operators.length > 1 && (
          <div>
            <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#5a6577] mb-1.5">
              Operator
            </div>
            <div className="flex gap-1">
              {opts.operators.map((op) => {
                const active = subFilters.operator === op;
                return (
                  <button
                    key={op}
                    onClick={() =>
                      onSubFiltersChange({
                        ...subFilters,
                        operator: active ? "" : op,
                      })
                    }
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-all capitalize ${
                      active
                        ? "border-[#2dd4bf] text-[#2dd4bf] bg-[#2dd4bf]/10 font-medium"
                        : "border-[#1c2a3a] text-[#6b7a8d] hover:border-[#3a4556] hover:text-[#8b97a8]"
                    }`}
                  >
                    {op}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Region dropdown */}
        {opts.regions.length > 1 && (
          <div>
            <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#5a6577] mb-1.5">
              Region
            </div>
            <select
              value={
                subFilters.regions.size === 1
                  ? Array.from(subFilters.regions)[0]
                  : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                onSubFiltersChange({
                  ...subFilters,
                  regions: v ? new Set([v]) : new Set(),
                });
              }}
              className="w-full text-[11px] px-2 py-1.5 rounded-lg bg-[#080c14] border border-[#1c2a3a] text-[#8b97a8] focus:outline-none focus:ring-1 focus:ring-[#2dd4bf]/30 appearance-none cursor-pointer"
            >
              <option value="">All regions</option>
              {opts.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Procedures chips */}
        {opts.procedures.length > 0 && (
          <ChipFilter
            label="Procedures"
            items={opts.procedures}
            selected={subFilters.procedures}
            onToggle={(v) => toggleSubFilterSet("procedures", v)}
            accentColor={color}
          />
        )}

        {/* Equipment chips */}
        {opts.equipment.length > 0 && (
          <ChipFilter
            label="Equipment"
            items={opts.equipment}
            selected={subFilters.equipment}
            onToggle={(v) => toggleSubFilterSet("equipment", v)}
            accentColor={color}
          />
        )}

        {/* Capabilities chips */}
        {opts.capabilities.length > 0 && (
          <ChipFilter
            label="Capabilities"
            items={opts.capabilities}
            selected={subFilters.capabilities}
            onToggle={(v) => toggleSubFilterSet("capabilities", v)}
            accentColor={color}
          />
        )}

        {/* Has doctors / has beds toggles */}
        {(opts.hasDoctorsData || opts.hasBedsData) && (
          <div>
            <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#5a6577] mb-1.5">
              Staffing & Capacity
            </div>
            <div className="flex flex-wrap gap-1.5">
              {opts.hasDoctorsData && (
                <button
                  onClick={() =>
                    onSubFiltersChange({
                      ...subFilters,
                      hasDoctors:
                        subFilters.hasDoctors === true ? null : true,
                    })
                  }
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    subFilters.hasDoctors === true
                      ? "border-[#2dd4bf] text-[#2dd4bf] bg-[#2dd4bf]/10 font-medium"
                      : "border-[#1c2a3a] text-[#6b7a8d] hover:border-[#3a4556] hover:text-[#8b97a8]"
                  }`}
                >
                  Has Doctors
                </button>
              )}
              {opts.hasBedsData && (
                <button
                  onClick={() =>
                    onSubFiltersChange({
                      ...subFilters,
                      hasBeds:
                        subFilters.hasBeds === true ? null : true,
                    })
                  }
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    subFilters.hasBeds === true
                      ? "border-[#2dd4bf] text-[#2dd4bf] bg-[#2dd4bf]/10 font-medium"
                      : "border-[#1c2a3a] text-[#6b7a8d] hover:border-[#3a4556] hover:text-[#8b97a8]"
                  }`}
                >
                  Has Beds
                </button>
              )}
            </div>
          </div>
        )}

        {/* Clear sub-filters */}
        {activeSubFilterCount > 0 && (
          <button
            onClick={() => onSubFiltersChange(EMPTY_SUB_FILTERS)}
            className="text-[10px] text-[#2dd4bf] hover:text-[#5eead4] transition-colors font-medium"
          >
            Clear sub-filters ({activeSubFilterCount})
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative h-full">
      {/* Collapse/Expand toggle tab — sits outside the overflow:hidden panel */}
      <button
        onClick={handleToggleCollapse}
        className="absolute -left-10 top-4 z-[501] flex flex-col items-center justify-center w-10 h-20 bg-[#0f1623] border border-[#263348] border-r-0 rounded-l-xl text-[#8b97a8] hover:text-[#2dd4bf] hover:bg-[#151d2e] hover:border-[#2dd4bf]/40 transition-all shadow-lg shadow-black/20"
        title={collapsed ? "Show filters" : "Hide filters"}
      >
        <svg
          className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {collapsed && (
          <span
            className="text-[9px] font-bold tracking-wider uppercase mt-1 text-[#2dd4bf]"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Filters
          </span>
        )}
        {!collapsed && activeSubFilterCount > 0 && (
          <span className="mt-1 w-4 h-4 rounded-full bg-[#2dd4bf] text-[#080c14] text-[9px] font-bold flex items-center justify-center">
            {activeSubFilterCount}
          </span>
        )}
      </button>

      <div
        className={`facilities-panel ${collapsed ? "collapsed" : ""}`}
      >
        {/* Panel content */}
        <div className={`panel-content ${collapsed ? "hidden" : ""}`}>
          {/* Header: Filters | Facility info — segment control */}
          <div className="px-4 pt-5 pb-4">
            <div className="flex rounded-xl bg-[#151d2e] border border-[#1c2a3a] p-1">
              <button
                onClick={() => setRightTab("filters")}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                  rightTab === "filters"
                    ? "bg-[#2dd4bf] text-[#080c14] shadow-sm"
                    : "text-[#6b7a8d] hover:text-[#8b97a8]"
                }`}
              >
                Filters
              </button>
              <button
                onClick={() => setRightTab("facility")}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                  rightTab === "facility"
                    ? "bg-[#2dd4bf] text-[#080c14] shadow-sm"
                    : "text-[#6b7a8d] hover:text-[#8b97a8]"
                }`}
              >
                Facility info
              </button>
            </div>
            {/* Filters-only sub-header */}
            {rightTab === "filters" && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {highlightCount > 0 && (
                    <p className="text-xs text-[#f59e0b] truncate">
                      {highlightCount} {chatFilterActive ? "AI results" : "highlighted"}
                    </p>
                  )}
                  {activeSubFilterCount > 0 && (
                    <p className="text-xs text-[#2dd4bf]">
                      {activeSubFilterCount} sub-filter{activeSubFilterCount > 1 ? "s" : ""} active
                    </p>
                  )}
                </div>
                <button
                  onClick={clearAll}
                  className="shrink-0 text-xs text-[#2dd4bf] hover:text-[#5eead4] transition-colors font-medium"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

        {/* AI filter active banner — only when Filters tab */}
        {rightTab === "filters" && (
        <>
        {chatFilterActive && highlightCount > 0 && (
          <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20">
            <div className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse shrink-0" />
            <span className="text-[11px] text-[#f59e0b] font-medium flex-1">
              Map filtered to {highlightCount} AI results
            </span>
            <button
              onClick={onClearChatFilter}
              className="text-[10px] text-[#8b97a8] hover:text-white px-1.5 py-0.5 rounded bg-[#1a2538] hover:bg-[#263348] transition-colors"
            >
              Show All
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="mx-4 border-t border-[#1c2a3a]" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Institutions (category) filter — collapsible */}
          <div className="px-4 py-2">
            <button
              type="button"
              onClick={() => setInstitutionsOpen(!institutionsOpen)}
              className="w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl text-left transition-colors hover:bg-[#151d2e] group/inst"
            >
              <span className="text-xs font-semibold tracking-[0.08em] uppercase text-[#5a6577] group-hover/inst:text-[#8b97a8]">
                Institutions
              </span>
              <svg
                className={`w-4 h-4 text-[#5a6577] transition-transform ${institutionsOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {institutionsOpen && (
            <div className="pt-1 space-y-1">
            {FACILITY_CATEGORIES.map((cat) => {
              const checked = selectedTypes.has(cat.key);
              const count = categoryCounts[cat.key] || 0;
              const isExpanded = expandedCategory === cat.key;
              return (
                <div key={cat.key}>
                  <div
                    className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors group ${
                      isExpanded ? "bg-[#151d2e]" : "hover:bg-[#151d2e]"
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                    >
                      {cat.icon}
                    </div>

                    {/* Checkbox */}
                    <button
                      onClick={() => toggleType(cat.key)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                        checked
                          ? "border-[#2dd4bf] bg-[#2dd4bf]"
                          : "border-[#3a4556] bg-transparent hover:border-[#5a6577]"
                      }`}
                    >
                      {checked && (
                        <svg className="w-3 h-3 text-[#080c14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Label */}
                    <span className={`text-sm flex-1 transition-colors ${
                      checked ? "text-white font-medium" : "text-[#6b7a8d]"
                    }`}>
                      {cat.label}
                    </span>

                    {/* Count */}
                    <span className="text-xs text-[#5a6577] font-medium tabular-nums">
                      {formatCount(count)}
                    </span>

                    {/* Filter icon — toggles sub-filters */}
                    <button
                      onClick={() =>
                        setExpandedCategory(isExpanded ? null : cat.key)
                      }
                      className={`transition-all ${
                        isExpanded
                          ? "text-[#2dd4bf]"
                          : "opacity-0 group-hover:opacity-100 text-[#5a6577] hover:text-[#8b97a8]"
                      }`}
                      title={
                        isExpanded
                          ? `Hide ${cat.label} filters`
                          : `Filter ${cat.label}`
                      }
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded sub-filters */}
                  {isExpanded && renderSubFilters(cat.key, cat.color)}
                </div>
              );
            })}

            {/* NGO row */}
            <div>
              <div
                className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors group ${
                  expandedCategory === "ngo" ? "bg-[#151d2e]" : "hover:bg-[#151d2e]"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </div>
                <button
                  onClick={() => onShowNgosChange(!showNgos)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    showNgos
                      ? "border-[#2dd4bf] bg-[#2dd4bf]"
                      : "border-[#3a4556] bg-transparent hover:border-[#5a6577]"
                  }`}
                >
                  {showNgos && (
                    <svg className="w-3 h-3 text-[#080c14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`text-sm flex-1 transition-colors ${
                  showNgos ? "text-white font-medium" : "text-[#6b7a8d]"
                }`}>
                  NGOs & Nonprofits
                </span>
                <span className="text-xs text-[#5a6577] font-medium tabular-nums">
                  {formatCount(categoryCounts["ngo"] || 0)}
                </span>
                <button
                  onClick={() =>
                    setExpandedCategory(
                      expandedCategory === "ngo" ? null : "ngo"
                    )
                  }
                  className={`transition-all ${
                    expandedCategory === "ngo"
                      ? "text-[#2dd4bf]"
                      : "opacity-0 group-hover:opacity-100 text-[#5a6577] hover:text-[#8b97a8]"
                  }`}
                  title={
                    expandedCategory === "ngo"
                      ? "Hide NGO filters"
                      : "Filter NGOs"
                  }
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                  </svg>
                </button>
              </div>

              {/* Expanded NGO sub-filters */}
              {expandedCategory === "ngo" &&
                renderSubFilters("ngo", "#ef4444")}
            </div>
            </div>
            )}
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-[#1c2a3a]" />

          {/* Specialty filter */}
          <div className="px-5 py-3">
            <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#5a6577] block mb-2">
              Specialty
            </label>
            <select
              value={selectedSpecialty}
              onChange={(e) => onSpecialtyChange(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg bg-[#151d2e] border border-[#1c2a3a] text-[#8b97a8] focus:outline-none focus:ring-1 focus:ring-[#2dd4bf]/30 appearance-none cursor-pointer"
            >
              <option value="">All specialties</option>
              {allSpecialties.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-[#1c2a3a]" />

          {/* Equipment / capability filters */}
          <div className="px-5 py-3">
            <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#5a6577] block mb-2">
              Equipment & Flags
            </label>
            <div className="space-y-1.5">
              {EQUIPMENT_FILTERS.map((eq) => {
                const active = equipmentFilters.has(eq.key);
                return (
                  <button
                    key={eq.key}
                    onClick={() => toggleEquipment(eq.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all text-xs ${
                      active
                        ? "bg-[#2dd4bf]/10 border-[#2dd4bf]/25 text-[#2dd4bf]"
                        : "bg-[#151d2e] border-[#1c2a3a] text-[#6b7a8d] hover:border-[#263348] hover:text-[#8b97a8]"
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: eq.color }}
                    />
                    {eq.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-[#1c2a3a]" />

          {/* Summary stats */}
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#5a6577]">
                Showing
              </span>
              <span className="text-sm font-bold text-white tabular-nums">
                {visibleCount}
              </span>
            </div>
            <div className="w-full bg-[#1c2a3a] rounded-full h-1.5">
              <div
                className="bg-[#2dd4bf] h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (visibleCount / Math.max(allFacilities.length, 1)) * 100)}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-[#5a6577] mt-1.5">
              {visibleCount} of {allFacilities.length} total facilities
            </p>
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-[#1c2a3a]" />

          {/* Insights accordion */}
          <div className="px-5 py-3">
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="flex items-center justify-between w-full group"
            >
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#5a6577] group-hover:text-[#8b97a8] transition-colors">
                Region Insights ({insights.length})
              </span>
              <svg
                className={`w-4 h-4 text-[#5a6577] transition-transform ${showInsights ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showInsights && (
              <div className="mt-3 space-y-2.5">
                {insights.length === 0 && (
                  <p className="text-xs text-[#3a4556] text-center py-4">
                    Loading insights...
                  </p>
                )}
                {insights.slice(0, 10).map((insight, i) => (
                  <div
                    key={i}
                    className="bg-[#151d2e] border border-[#1c2a3a] rounded-xl p-3.5 hover:border-[#263348] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-semibold text-white leading-snug">
                        {insight.title}
                      </h4>
                      <span className="text-[11px] font-bold text-[#8b97a8] shrink-0">
                        {insight.score}%
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6b7a8d] leading-relaxed mb-1">
                      {insight.description}
                    </p>
                    <p className="text-[11px] text-[#5a6577] leading-relaxed italic">
                      {insight.nextStep}
                    </p>
                    {insight.facilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {insight.facilities.map((name, j) => (
                          <span
                            key={j}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a2538] border border-[#1c2a3a] text-[#6b7a8d] truncate max-w-[160px]"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {rightTab === "facility" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Selected facility detail at top */}
            {selectedFacility && (
              <div className="shrink-0 overflow-y-auto custom-scrollbar px-4 pt-4 pb-2 border-b border-[#1c2a3a] max-h-[45%]">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-white leading-tight">{selectedFacility.name}</h3>
                    <button
                      onClick={() => onSelectFacility(null)}
                      className="shrink-0 text-[#5a6577] hover:text-[#e8edf5] p-0.5 rounded"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-[#6b7a8d]">
                    {selectedFacility.city}{selectedFacility.region ? `, ${selectedFacility.region}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedFacility.type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a2538] text-[#8b97a8] border border-[#1c2a3a]">
                        {selectedFacility.type}
                      </span>
                    )}
                    {selectedFacility.operator && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a2538] text-[#8b97a8] border border-[#1c2a3a]">
                        {selectedFacility.operator}
                      </span>
                    )}
                    {highlightedNames.has(selectedFacility.name) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30">
                        Chat Result
                      </span>
                    )}
                  </div>

                  {/* Reliability score: 1–10 visualization or placeholder */}
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#5a6577] mb-1.5">Reliability</h4>
                    {selectedFacility.reliabilityScore != null && selectedFacility.reliabilityScore >= 1 && selectedFacility.reliabilityScore <= 10 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#8b97a8]">Score</span>
                          <span className="font-semibold text-white tabular-nums">{selectedFacility.reliabilityScore} / 10</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#1c2a3a] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#22c55e] via-[#eab308] to-[#ef4444] transition-all duration-300"
                            style={{ width: `${(selectedFacility.reliabilityScore / 10) * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-[#5a6577]">
                          <span>1</span>
                          <span>10</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#5a6577] italic">Not enough data to predict reliability.</p>
                    )}
                    {selectedFacility.reliabilityExplanation?.trim() && (
                      <p className="text-[11px] text-[#6b7a8d] leading-relaxed mt-1.5">
                        {selectedFacility.reliabilityExplanation.trim()}
                      </p>
                    )}
                  </div>

                  {/* About / Description — always show; placeholder when empty */}
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#5a6577] mb-1">About</h4>
                    <p className="text-xs text-[#8b97a8] leading-relaxed">
                      {selectedFacility.description?.trim() || "No description available."}
                    </p>
                  </div>

                  {(selectedFacility.doctors != null || selectedFacility.beds != null) && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#5a6577] mb-1">Capacity</h4>
                      <div className="flex gap-4 text-xs text-[#8b97a8]">
                        {selectedFacility.doctors != null && <span>👨‍⚕️ {selectedFacility.doctors} doctors</span>}
                        {selectedFacility.beds != null && <span>🛏️ {selectedFacility.beds} beds</span>}
                      </div>
                    </div>
                  )}

                  {(selectedFacility.phone || selectedFacility.email || selectedFacility.website) && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#5a6577] mb-1.5">Contact</h4>
                      <ul className="space-y-1 text-xs text-[#8b97a8]">
                        {selectedFacility.phone && (
                          <li>
                            <a href={`tel:${selectedFacility.phone}`} className="text-[#2dd4bf] hover:underline">
                              📞 {selectedFacility.phone}
                            </a>
                          </li>
                        )}
                        {selectedFacility.email && (
                          <li>
                            <a href={`mailto:${selectedFacility.email}`} className="text-[#2dd4bf] hover:underline break-all">
                              ✉️ {selectedFacility.email}
                            </a>
                          </li>
                        )}
                        {selectedFacility.website && (
                          <li>
                            <a
                              href={selectedFacility.website.startsWith("http") ? selectedFacility.website : `https://${selectedFacility.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#2dd4bf] hover:underline break-all"
                            >
                              🔗 {selectedFacility.website}
                            </a>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#5a6577] mb-1.5">Services</h4>
                    <div className="space-y-2 text-xs">
                      {selectedFacility.specialties.length > 0 && (
                        <div>
                          <span className="text-[#5a6577]">Specialties</span>
                          <p className="text-[#8b97a8] mt-0.5">{selectedFacility.specialties.join(", ")}</p>
                        </div>
                      )}
                      {selectedFacility.procedures.length > 0 && (
                        <div>
                          <span className="text-[#5a6577]">Procedures</span>
                          <ul className="text-[#8b97a8] mt-0.5 list-disc list-inside space-y-0.5">
                            {selectedFacility.procedures.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedFacility.equipment.length > 0 && (
                        <div>
                          <span className="text-[#5a6577]">Equipment</span>
                          <ul className="text-[#8b97a8] mt-0.5 list-disc list-inside space-y-0.5">
                            {selectedFacility.equipment.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedFacility.capabilities.length > 0 && (
                        <div>
                          <span className="text-[#5a6577]">Capabilities</span>
                          <ul className="text-[#8b97a8] mt-0.5 list-disc list-inside space-y-0.5">
                            {selectedFacility.capabilities.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedFacility.specialties.length === 0 &&
                        selectedFacility.procedures.length === 0 &&
                        selectedFacility.equipment.length === 0 &&
                        selectedFacility.capabilities.length === 0 && (
                          <p className="text-[#5a6577] italic">No service details listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Facility list — fixed order, condensed rows; click selects and pans map */}
            <div className="flex-1 flex flex-col min-h-0 pt-2">
              <div className="shrink-0 px-4 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5a6577]">
                  {selectedFacility ? "All facilities" : "Select a facility"}
                </span>
                <span className="text-[10px] text-[#3a4556] ml-1.5">({sortedFacilities.length})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-4">
                {sortedFacilities.length === 0 ? (
                  <p className="text-xs text-[#5a6577] text-center py-6 px-2">
                    No facilities match the current filters.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {sortedFacilities.map((f) => {
                      const isSelected = selectedFacility?.uid === f.uid;
                      const isHighlighted = highlightedNames.has(f.name);
                      return (
                        <button
                          key={f.uid || f.id + f.city}
                          ref={isSelected ? selectedRowRef : undefined}
                          type="button"
                          onClick={() => onSelectFacility(f)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            isSelected
                              ? "bg-[#2dd4bf]/15 border border-[#2dd4bf]/40 text-white"
                              : "border border-transparent text-[#8b97a8] hover:bg-[#151d2e] hover:text-[#c4cdd9]"
                          } ${isHighlighted && !isSelected ? "ring-1 ring-[#f59e0b]/30" : ""}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: isHighlighted
                                  ? "#f59e0b"
                                  : f.orgType === "ngo"
                                  ? "#ef4444"
                                  : { hospital: "#3b82f6", clinic: "#22c55e", doctor: "#a855f7", pharmacy: "#f97316", dentist: "#2dd4bf" }[f.type] || "#6b7a8d",
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate text-inherit">{f.name}</div>
                              <div className="text-[10px] text-[#6b7a8d] truncate">
                                {f.city}{f.region ? `, ${f.region}` : ""}
                              </div>
                            </div>
                            {isHighlighted && (
                              <span className="shrink-0 text-[9px] px-1.5 py-0 rounded bg-[#f59e0b]/20 text-[#f59e0b] font-medium">
                                Chat
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
