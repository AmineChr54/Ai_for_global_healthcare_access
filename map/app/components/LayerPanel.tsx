"use client";

import type { LayerState, Analysis } from "../page";

interface Props {
  layers: LayerState;
  onLayersChange: (l: LayerState) => void;
  onClose: () => void;
  analysis: Analysis | null;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  color,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <button
        onClick={() => onChange(!checked)}
        className={`mt-0.5 w-9 h-5 rounded-full transition-colors relative shrink-0 ${
          checked ? color : "bg-gray-200"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </div>
  );
}

export default function LayerPanel({ layers, onLayersChange, onClose, analysis }: Props) {
  const update = (partial: Partial<LayerState>) =>
    onLayersChange({ ...layers, ...partial });

  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col shadow-lg">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Layer Tools</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Section: Advanced Insights */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Advanced Insights
          </h3>

          <Toggle
            label="Medical Deserts"
            description="Areas with no hospital within 50km"
            checked={layers.showDeserts}
            onChange={(v) => update({ showDeserts: v })}
            color="bg-red-500"
          />

          <Toggle
            label="Hospital Coverage"
            description="Green = good coverage, Red = gaps"
            checked={layers.showCoverage}
            onChange={(v) => update({ showCoverage: v })}
            color="bg-emerald-500"
          />

          <Toggle
            label="Population Underserved"
            description="Heatmap weighted by population per facility"
            checked={layers.showPopulation}
            onChange={(v) => update({ showPopulation: v })}
            color="bg-orange-500"
          />
        </div>

        {/* Sliders */}
        {layers.showPopulation && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Population Threshold</span>
              <span className="font-mono">{(layers.populationThreshold / 1000).toFixed(0)}k/facility</span>
            </div>
            <input
              type="range"
              min={10000}
              max={200000}
              step={5000}
              value={layers.populationThreshold}
              onChange={(e) => update({ populationThreshold: Number(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>10k</span>
              <span>200k</span>
            </div>
          </div>
        )}

        {/* Section: Facility Display */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Facility Display
          </h3>

          <Toggle
            label="Facility Markers"
            description="Clustered markers for all facilities"
            checked={layers.showFacilities}
            onChange={(v) => update({ showFacilities: v })}
            color="bg-indigo-500"
          />
        </div>

        {/* Region Stats */}
        {analysis && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Key Statistics
            </h3>
            <div className="space-y-2">
              <div className="bg-blue-50 rounded-lg p-2.5">
                <div className="text-xs text-blue-600 font-medium">Total Facilities</div>
                <div className="text-lg font-bold text-blue-900">
                  {Object.values(analysis.regionStats).reduce((s: number, r: any) => s + r.facilities, 0)}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-2.5">
                <div className="text-xs text-red-600 font-medium">Medical Desert Cities</div>
                <div className="text-lg font-bold text-red-900">
                  {analysis.medicalDeserts.length}
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2.5">
                <div className="text-xs text-amber-600 font-medium">Ghana Doctors / 10k pop</div>
                <div className="text-lg font-bold text-amber-900">
                  {analysis.ghanaHealthStats.doctors_per_10k}
                  <span className="text-xs font-normal text-amber-600 ml-1">
                    (WHO min: {analysis.whoGuidelines.doctors_per_10k})
                  </span>
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-2.5">
                <div className="text-xs text-purple-600 font-medium">Specialties Tracked</div>
                <div className="text-lg font-bold text-purple-900">
                  {Object.keys(analysis.specialtyDistribution).length}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
