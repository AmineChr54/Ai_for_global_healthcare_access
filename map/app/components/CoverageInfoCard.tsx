"use client";

import { useMemo, useState } from "react";
import type { Analysis, Facility } from "@/types";

interface Props {
  analysis: Analysis | null;
  facilities: Facility[];
}

export default function CoverageInfoCard({ analysis, facilities }: Props) {
  const stats = useMemo(() => {
    if (!analysis || facilities.length === 0)
      return {
        score: 0,
        totalFacilities: 0,
        hospitals: 0,
        clinics: 0,
        doctors: 0,
        beds: 0,
        deserts: 0,
        totalPopulation: 0,
        doctorsPerCapita: 0,
        bedsPerCapita: 0,
        regionsServed: 0,
        totalRegions: 0,
      };

    const hospitals = facilities.filter(
      (f) => f.type === "hospital" && f.orgType === "facility"
    ).length;
    const clinics = facilities.filter(
      (f) => f.type === "clinic" && f.orgType === "facility"
    ).length;
    const doctors = facilities.reduce(
      (sum, f) => sum + (f.doctors ?? 0),
      0
    );
    const beds = facilities.reduce((sum, f) => sum + (f.beds ?? 0), 0);

    const totalPopulation = Object.values(
      analysis.regionPopulation ?? {}
    ).reduce((s: number, v: number) => s + v, 0);

    // Regions with at least one facility
    const regionSet = new Set(
      facilities.map((f) => f.region).filter(Boolean)
    );
    const totalRegions = Object.keys(
      analysis.regionPopulation ?? {}
    ).length;

    // ── Composite coverage score (1–10) ──
    // Based on WHO guidelines and actual ratios

    // 1. Doctor-to-population ratio (WHO: 1 per 1000)
    const whoDoctor = analysis.whoGuidelines?.["doctors_per_1000"] ?? 1;
    const actualDoctorPer1k =
      totalPopulation > 0 ? (doctors / totalPopulation) * 1000 : 0;
    const doctorScore = Math.min(actualDoctorPer1k / whoDoctor, 1);

    // 2. Bed-to-population ratio (WHO: 3 per 1000)
    const whoBeds = analysis.whoGuidelines?.["beds_per_1000"] ?? 3;
    const actualBedsPer1k =
      totalPopulation > 0 ? (beds / totalPopulation) * 1000 : 0;
    const bedsScore = Math.min(actualBedsPer1k / whoBeds, 1);

    // 3. Hospital-to-population ratio (rough: 1 per 100k)
    const hospitalPer100k =
      totalPopulation > 0 ? (hospitals / totalPopulation) * 100000 : 0;
    const hospitalScore = Math.min(hospitalPer100k / 1, 1); // 1 per 100k = ideal

    // 4. Geographic coverage (% of grid points with any facilities nearby)
    const gridTotal = analysis.coverageGrid.length;
    const gridCovered = analysis.coverageGrid.filter(
      (p) => p.facilityCount > 0
    ).length;
    const geoScore = gridTotal > 0 ? gridCovered / gridTotal : 0;

    // 5. Regional equity (% of regions that have at least 1 facility)
    const regionScore =
      totalRegions > 0 ? regionSet.size / totalRegions : 0;

    // Weighted composite
    const composite =
      doctorScore * 0.25 +
      bedsScore * 0.2 +
      hospitalScore * 0.2 +
      geoScore * 0.2 +
      regionScore * 0.15;

    const score = Math.round(composite * 100) / 10; // 0–10

    return {
      score: Math.min(score, 10),
      totalFacilities: facilities.length,
      hospitals,
      clinics,
      doctors,
      beds,
      deserts: analysis.medicalDeserts.length,
      totalPopulation,
      doctorsPerCapita: actualDoctorPer1k,
      bedsPerCapita: actualBedsPer1k,
      regionsServed: regionSet.size,
      totalRegions,
    };
  }, [analysis, facilities]);

  const [expanded, setExpanded] = useState(false);

  if (!analysis) return null;

  const pct = (stats.score / 10) * 100;

  return (
    <div className="coverage-info-card">
      {/* Clickable header — always visible */}
      <button
        className="coverage-info-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="coverage-info-flag">{"\uD83C\uDDEC\uD83C\uDDED"}</span>
        <span className="coverage-info-country">Ghana</span>
        <span
          className="ml-auto text-xs font-bold tabular-nums"
          style={{
            color:
              stats.score >= 6
                ? "#22c55e"
                : stats.score >= 3
                ? "#f59e0b"
                : "#ef4444",
          }}
        >
          {stats.score.toFixed(1)}/10
        </span>
        <svg
          className="coverage-info-chevron"
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#5a6577"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Collapsible body */}
      <div
        className="coverage-info-body"
        style={{
          maxHeight: expanded ? "300px" : "0px",
          opacity: expanded ? 1 : 0,
          marginTop: expanded ? "0" : "0",
        }}
      >
        <div className="coverage-info-label">Healthcare Coverage Index</div>

        {/* Gradient bar with marker */}
        <div className="coverage-info-bar-container">
          <span className="coverage-info-bar-label">Poor</span>
          <div className="coverage-info-bar">
            <div className="coverage-info-bar-fill" />
            <div
              className="coverage-info-bar-marker"
              style={{ left: `${Math.max(2, Math.min(98, pct))}%` }}
            >
              <svg width="10" height="8" viewBox="0 0 10 8">
                <polygon points="5,0 10,8 0,8" fill="#e8edf5" />
              </svg>
            </div>
          </div>
          <span className="coverage-info-bar-label">Excellent</span>
        </div>

        {/* Key metrics row */}
        <div className="coverage-info-metrics">
          <div className="coverage-info-metric">
            <span className="coverage-info-metric-value">{stats.totalFacilities}</span>
            <span className="coverage-info-metric-label">Facilities</span>
          </div>
          <div className="coverage-info-metric-divider" />
          <div className="coverage-info-metric">
            <span className="coverage-info-metric-value">{stats.doctors}</span>
            <span className="coverage-info-metric-label">Doctors</span>
          </div>
          <div className="coverage-info-metric-divider" />
          <div className="coverage-info-metric">
            <span className="coverage-info-metric-value">{stats.beds}</span>
            <span className="coverage-info-metric-label">Beds</span>
          </div>
          <div className="coverage-info-metric-divider" />
          <div className="coverage-info-metric">
            <span
              className="coverage-info-metric-value"
              style={{ color: stats.deserts > 0 ? "#ef4444" : "#22c55e" }}
            >
              {stats.deserts}
            </span>
            <span className="coverage-info-metric-label">Deserts</span>
          </div>
        </div>

        {/* Sub-stats */}
        <div className="coverage-info-sub">
          <span>
            {stats.doctorsPerCapita.toFixed(2)} doctors / 1k pop
          </span>
          <span className="coverage-info-sub-dot">·</span>
          <span>
            {stats.bedsPerCapita.toFixed(2)} beds / 1k pop
          </span>
          <span className="coverage-info-sub-dot">·</span>
          <span>
            {stats.regionsServed}/{stats.totalRegions} regions
          </span>
        </div>
      </div>
    </div>
  );
}
