"use client";

import type { Facility, Analysis } from "@/types";

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  hospital: { label: "Hospitals", color: "bg-blue-100 text-blue-800" },
  clinic: { label: "Clinics", color: "bg-green-100 text-green-800" },
  doctor: { label: "Doctors", color: "bg-purple-100 text-purple-800" },
  pharmacy: { label: "Pharmacies", color: "bg-orange-100 text-orange-800" },
  dentist: { label: "Dentists", color: "bg-teal-100 text-teal-800" },
};

interface Props {
  facilities: Facility[];
  allFacilities: Facility[];
  search: string;
  onSearch: (v: string) => void;
  selectedSpecialty: string;
  onSpecialtyChange: (v: string) => void;
  allSpecialties: string[];
  selectedTypes: Set<string>;
  onTypesChange: (v: Set<string>) => void;
  showNgos: boolean;
  onNgosChange: (v: boolean) => void;
  selectedFacility: Facility | null;
  onSelectFacility: (f: Facility | null) => void;
  analysis: Analysis | null;
  highlightedNames: Set<string>;
  onClearHighlights: () => void;
}

export default function Sidebar({
  facilities,
  allFacilities,
  search,
  onSearch,
  selectedSpecialty,
  onSpecialtyChange,
  allSpecialties,
  selectedTypes,
  onTypesChange,
  showNgos,
  onNgosChange,
  selectedFacility,
  onSelectFacility,
  analysis,
  highlightedNames,
  onClearHighlights,
}: Props) {
  const toggleType = (t: string) => {
    const next = new Set(selectedTypes);
    next.has(t) ? next.delete(t) : next.add(t);
    onTypesChange(next);
  };

  const facilityCount = facilities.filter((f) => f.orgType === "facility").length;
  const ngoCount = facilities.filter((f) => f.orgType === "ngo").length;

  // Sort: highlighted facilities first
  const hasHighlights = highlightedNames.size > 0;
  const sortedFacilities = hasHighlights
    ? [
        ...facilities.filter((f) => highlightedNames.has(f.name)),
        ...facilities.filter((f) => !highlightedNames.has(f.name)),
      ]
    : facilities;

  const highlightedCount = hasHighlights
    ? facilities.filter((f) => highlightedNames.has(f.name)).length
    : 0;

  return (
    <div className="w-80 h-full bg-white border-r border-gray-200 flex flex-col shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">
          🏥 VF Healthcare Map
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Ghana &middot; {allFacilities.length} facilities
        </p>
      </div>

      {/* Chat result banner */}
      {hasHighlights && (
        <div className="px-3 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-amber-800">
              🔍 {highlightedCount} facilities from your query
            </div>
            <div className="text-xs text-amber-600">Highlighted on map</div>
          </div>
          <button
            onClick={onClearHighlights}
            className="text-xs text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Search */}
      <div className="p-3 border-b border-gray-100 space-y-2">
        <input
          type="text"
          placeholder="Search facilities or cities..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <select
          value={selectedSpecialty}
          onChange={(e) => onSpecialtyChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All specialties</option>
          {allSpecialties.map((s) => (
            <option key={s} value={s}>
              {s} ({analysis?.specialtyDistribution[s]?.total || 0})
            </option>
          ))}
        </select>
      </div>

      {/* Type filters */}
      <div className="p-3 border-b border-gray-100 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-1">
          <span>FILTER BY TYPE</span>
          <span className="text-indigo-600 font-semibold">{facilities.length} results</span>
        </div>
        {Object.entries(TYPE_BADGES).map(([type, { label, color }]) => {
          const count = facilities.filter((f) => f.type === type).length;
          return (
            <label key={type} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedTypes.has(type)}
                onChange={() => toggleType(type)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>{label}</span>
              <span className="ml-auto text-xs text-gray-400">{count}</span>
            </label>
          );
        })}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showNgos}
            onChange={(e) => onNgosChange(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">NGOs</span>
          <span className="ml-auto text-xs text-gray-400">{ngoCount}</span>
        </label>
      </div>

      {/* Facility inspector */}
      {selectedFacility && (
        <div className="p-3 border-b border-gray-100 bg-indigo-50">
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-bold text-gray-900">{selectedFacility.name}</h3>
            <button
              onClick={() => onSelectFacility(null)}
              className="text-gray-400 hover:text-gray-600 text-xs ml-2"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {selectedFacility.city}{selectedFacility.region ? `, ${selectedFacility.region}` : ""}
          </p>
          {selectedFacility.type && (
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${TYPE_BADGES[selectedFacility.type]?.color || "bg-gray-100 text-gray-600"}`}>
              {selectedFacility.type}
            </span>
          )}
          {highlightedNames.has(selectedFacility.name) && (
            <span className="inline-block mt-1 ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Chat Result
            </span>
          )}
          {selectedFacility.specialties.length > 0 && (
            <div className="mt-2">
              <span className="text-xs font-semibold text-gray-700">Specialties: </span>
              <span className="text-xs text-gray-600">{selectedFacility.specialties.join(", ")}</span>
            </div>
          )}
          {selectedFacility.procedures.length > 0 && (
            <div className="mt-1">
              <span className="text-xs font-semibold text-gray-700">Procedures: </span>
              <span className="text-xs text-gray-600">{selectedFacility.procedures.slice(0, 5).join("; ")}</span>
            </div>
          )}
          {selectedFacility.equipment.length > 0 && (
            <div className="mt-1">
              <span className="text-xs font-semibold text-gray-700">Equipment: </span>
              <span className="text-xs text-gray-600">{selectedFacility.equipment.slice(0, 5).join("; ")}</span>
            </div>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray-600">
            {selectedFacility.doctors && <span>👨‍⚕️ {selectedFacility.doctors} doctors</span>}
            {selectedFacility.beds && <span>🛏️ {selectedFacility.beds} beds</span>}
          </div>
        </div>
      )}

      {/* Facility list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sortedFacilities.slice(0, 100).map((f, idx) => {
          const isHighlighted = highlightedNames.has(f.name);
          return (
            <button
              key={f.uid || f.id + f.city + idx}
              onClick={() => onSelectFacility(f)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selectedFacility?.uid === f.uid
                  ? "bg-indigo-50"
                  : isHighlighted
                  ? "bg-amber-50"
                  : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                  style={{
                    backgroundColor: isHighlighted
                      ? "#f59e0b"
                      : f.orgType === "ngo"
                      ? "#dc2626"
                      : ({ hospital: "#2563eb", clinic: "#16a34a", doctor: "#9333ea", pharmacy: "#ea580c", dentist: "#0d9488" }[f.type] || "#6b7280"),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{f.name}</span>
                    {isHighlighted && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0 rounded bg-amber-100 text-amber-700 font-semibold">
                        CHAT
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {f.city}{f.region ? `, ${f.region}` : ""}
                  </div>
                  {f.specialties.length > 0 && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {f.specialties.slice(0, 3).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {sortedFacilities.length > 100 && (
          <div className="p-3 text-center text-xs text-gray-400">
            Showing 100 of {sortedFacilities.length} — use search to narrow
          </div>
        )}
      </div>
    </div>
  );
}
