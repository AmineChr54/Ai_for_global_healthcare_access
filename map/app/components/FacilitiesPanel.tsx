"use client";

import { useMemo, useState } from "react";
import type { Facility, Analysis } from "@/types";

interface RegionInsight {
  title: string;
  description: string;
  nextStep: string;
  score: number;
  facilities: string[];
  region: string;
  specialty: string;
}

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
}

const FILTER_CHIPS = [
  { key: "oxygen", label: "Oxygen" },
  { key: "icu", label: "ICU" },
  { key: "anomalies", label: "Anomalies" },
];

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

      // Only flag low-coverage specialties in populated regions
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
}: Props) {
  const [activeTab, setActiveTab] = useState<"insights" | "list">("insights");

  const insights = useMemo(() => {
    if (!analysis) return [];
    return generateInsights(analysis, allFacilities);
  }, [analysis, allFacilities]);

  const toggleChip = (key: string) => {
    const next = new Set(equipmentFilters);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onEquipmentFiltersChange(next);
  };

  const visibleCount = facilities.length;
  const highlightCount = highlightedNames.size;

  return (
    <div className="h-full bg-[#0f1623] rounded-2xl border border-[#1c2a3a] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#5a6577]">
              Facilities
            </h2>
            <p className="text-sm text-[#8b97a8] mt-0.5">
              {visibleCount} visible
              {highlightCount > 0 && (
                <span className="text-[#f59e0b] ml-2">
                  {highlightCount} highlighted
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("insights")}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "insights"
                  ? "bg-[#2dd4bf]/10 text-[#2dd4bf]"
                  : "text-[#5a6577] hover:text-[#8b97a8]"
              }`}
            >
              Insights
            </button>
            <select
              value={selectedSpecialty}
              onChange={(e) => onSpecialtyChange(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#151d2e] border border-[#1c2a3a] text-[#8b97a8] focus:outline-none focus:ring-1 focus:ring-[#2dd4bf]/30 appearance-none cursor-pointer"
            >
              <option value="">All specialties</option>
              {allSpecialties.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mt-3">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => toggleChip(chip.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                equipmentFilters.has(chip.key)
                  ? "bg-[#2dd4bf]/15 border-[#2dd4bf]/30 text-[#2dd4bf]"
                  : "bg-[#151d2e] border-[#1c2a3a] text-[#6b7a8d] hover:border-[#263348] hover:text-[#8b97a8]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-[#1c2a3a]" />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        {activeTab === "insights" ? (
          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#5a6577] mb-2">
              Region Insights
            </h3>

            {insights.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-[#3a4556]">
                  Loading insights...
                </p>
              </div>
            )}

            {insights.map((insight, i) => (
              <div
                key={i}
                className="bg-[#151d2e] border border-[#1c2a3a] rounded-xl p-4 hover:border-[#263348] transition-all"
              >
                {/* Title + score */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-[13px] font-semibold text-white leading-snug">
                    {insight.title}
                  </h4>
                  <span className="text-sm font-bold text-[#8b97a8] shrink-0">
                    {insight.score}%
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-[#6b7a8d] leading-relaxed mb-1.5">
                  {insight.description}
                </p>

                {/* Next step */}
                <p className="text-xs text-[#5a6577] leading-relaxed italic">
                  {insight.nextStep}
                </p>

                {/* Facility tags */}
                {insight.facilities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {insight.facilities.map((name, j) => (
                      <span
                        key={j}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-[#1a2538] border border-[#1c2a3a] text-[#6b7a8d] truncate max-w-[180px]"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Facility list view */
          <div className="space-y-1">
            {facilities.slice(0, 50).map((f, i) => {
              const isHighlighted = highlightedNames.has(f.name);
              return (
                <div
                  key={f.uid || `${f.id}-${i}`}
                  className={`px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                    isHighlighted
                      ? "bg-[#f59e0b]/10 border-[#f59e0b]/20"
                      : "bg-[#151d2e] border-[#1c2a3a] hover:border-[#263348]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: isHighlighted
                          ? "#f59e0b"
                          : f.orgType === "ngo"
                          ? "#dc2626"
                          : {
                              hospital: "#2563eb",
                              clinic: "#16a34a",
                              doctor: "#9333ea",
                              pharmacy: "#ea580c",
                              dentist: "#0d9488",
                            }[f.type] || "#6b7280",
                      }}
                    />
                    <span className="text-xs font-medium text-white truncate">
                      {f.name}
                    </span>
                    {isHighlighted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] font-semibold shrink-0">
                        MATCH
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5a6577] ml-4 truncate">
                    {f.city}
                    {f.region ? `, ${f.region}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
