"use client";

import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { latLngToCell, cellToBoundary, cellToLatLng, gridDisk } from "h3-js";
import type { Facility, Analysis, LayerState } from "@/types";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const TYPE_COLORS: Record<string, string> = {
  hospital: "#3b82f6",
  clinic: "#22c55e",
  doctor: "#a855f7",
  pharmacy: "#f97316",
  dentist: "#2dd4bf",
  ngo: "#ef4444",
};

/* ── Color interpolation helpers ── */

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b))
    .toString(16)
    .slice(1)}`;
}

function interpolateStops(
  stops: { t: number; color: string }[],
  value: number
): string {
  const v = Math.max(0, Math.min(1, value));
  for (let i = 0; i < stops.length - 1; i++) {
    const s = stops[i];
    const e = stops[i + 1];
    if (v >= s.t && v <= e.t) {
      const t = (v - s.t) / (e.t - s.t);
      const [r1, g1, b1] = hexToRgb(s.color);
      const [r2, g2, b2] = hexToRgb(e.color);
      return rgbToHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t));
    }
  }
  return stops[stops.length - 1].color;
}

/* ── Coverage color scale (red → green → teal) ── */
const COVERAGE_STOPS = [
  { t: 0.0, color: "#ef4444" },
  { t: 0.25, color: "#f97316" },
  { t: 0.5, color: "#eab308" },
  { t: 0.75, color: "#22c55e" },
  { t: 1.0, color: "#0f766e" },
];

function coverageToColor(value: number): string {
  return interpolateStops(COVERAGE_STOPS, value);
}

/* ── Desert severity scale (amber → red → deep crimson) ── */
const DESERT_STOPS = [
  { t: 0.0, color: "#fbbf24" }, // amber-400: barely a desert
  { t: 0.25, color: "#f97316" }, // orange-500
  { t: 0.55, color: "#ef4444" }, // red-500
  { t: 0.8, color: "#dc2626" }, // red-600
  { t: 1.0, color: "#7f1d1d" }, // red-900: extreme desert
];

function desertSeverityColor(coverageIndex: number): string {
  // coverageIndex 0..0.5 → severity 1..0 (lower coverage = higher severity)
  const severity = Math.max(0, Math.min(1, 1 - coverageIndex * 2));
  return interpolateStops(DESERT_STOPS, severity);
}

function desertFillOpacity(coverageIndex: number): number {
  const severity = Math.max(0, Math.min(1, 1 - coverageIndex * 2));
  return 0.3 + 0.55 * severity; // 0.30 (mild) → 0.85 (extreme)
}

function desertBorderOpacity(coverageIndex: number): number {
  const severity = Math.max(0, Math.min(1, 1 - coverageIndex * 2));
  return 0.25 + 0.6 * severity; // 0.25 → 0.85
}

/* ── Ghana boundary polygon (simplified ~35-vertex outline) ── */
// [lat, lon] clockwise from NW corner.
// Coastline is pushed ~0.08° inland so hex centers don't create ocean tiles.
const GHANA_BOUNDARY: [number, number][] = [
  // Northern border (Burkina Faso)
  [11.0, -2.88],
  [11.1, -2.3],
  [11.17, -1.5],
  [11.18, -0.7],
  [11.13, 0.0],
  [11.05, 0.2],
  // Eastern border (Togo)
  [10.6, 0.15],
  [10.0, 0.18],
  [9.4, 0.32],
  [8.7, 0.45],
  [8.0, 0.52],
  [7.4, 0.58],
  [6.8, 0.64],
  [6.4, 0.8],
  [6.2, 1.0],
  [6.12, 1.18],
  // Southeast coast → southwest coast (with inland buffer)
  [6.0, 1.0],
  [5.88, 0.68],
  [5.75, 0.1],
  [5.66, -0.15],
  [5.46, -0.55],
  [5.22, -1.15],
  [5.05, -1.65],
  [4.97, -2.0],
  [4.98, -2.35],
  [5.12, -2.72],
  [5.22, -3.0],
  // Western border (Ivory Coast)
  [5.6, -3.12],
  [6.3, -3.0],
  [7.2, -2.82],
  [8.0, -2.68],
  [8.8, -2.52],
  [9.5, -2.47],
  [10.2, -2.55],
  [10.6, -2.72],
  [11.0, -2.88], // close
];

/* Ray-casting point-in-polygon test */
function isInsideGhana(lat: number, lon: number): boolean {
  // Quick bounding-box reject
  if (lat < 4.9 || lat > 11.2 || lon < -3.15 || lon > 1.2) return false;
  let inside = false;
  for (let i = 0, j = GHANA_BOUNDARY.length - 1; i < GHANA_BOUNDARY.length; j = i++) {
    const [yi, xi] = GHANA_BOUNDARY[i];
    const [yj, xj] = GHANA_BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/* ── H3 hex data builder ── */

interface HexData {
  h3Index: string;
  coverageIndex: number;
  facilityCount: number;
  contributions: number;
}

function buildHexData(
  grid: Analysis["coverageGrid"],
  resolution: number
): Map<string, HexData> {
  const hexMap = new Map<string, HexData>();

  for (const pt of grid) {
    if (!isInsideGhana(pt.lat, pt.lon)) continue;

    const h3Index = latLngToCell(pt.lat, pt.lon, resolution);
    // Spread each grid point to center + 2 rings to fully tessellate
    // (grid step ~0.1° needs ring-2 at res-5 to guarantee no gaps)
    const cells = gridDisk(h3Index, 2);

    for (const idx of cells) {
      const existing = hexMap.get(idx);
      if (existing) {
        existing.coverageIndex += pt.coverageIndex;
        existing.facilityCount += pt.facilityCount;
        existing.contributions += 1;
      } else {
        hexMap.set(idx, {
          h3Index: idx,
          coverageIndex: pt.coverageIndex,
          facilityCount: pt.facilityCount,
          contributions: 1,
        });
      }
    }
  }

  // Average the coverage index
  for (const hex of hexMap.values()) {
    hex.coverageIndex = hex.coverageIndex / hex.contributions;
  }

  // Remove hexes whose centers fall outside Ghana (ocean, neighbors)
  for (const idx of hexMap.keys()) {
    const [lat, lon] = cellToLatLng(idx);
    if (!isInsideGhana(lat, lon)) {
      hexMap.delete(idx);
    }
  }

  return hexMap;
}

function hexToGeoJSON(hexMap: Map<string, HexData>) {
  const features: GeoJSON.Feature[] = [];

  for (const hex of hexMap.values()) {
    const boundary = cellToBoundary(hex.h3Index);
    // h3 returns [lat, lng] pairs; GeoJSON needs [lng, lat]
    const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
    coords.push(coords[0]); // close the polygon

    const severity = Math.max(0, Math.min(1, 1 - hex.coverageIndex * 2));

    features.push({
      type: "Feature",
      properties: {
        coverageIndex: hex.coverageIndex,
        facilityCount: hex.facilityCount,
        h3Index: hex.h3Index,
        severity,
      },
      geometry: {
        type: "Polygon",
        coordinates: [coords],
      },
    });
  }

  return { type: "FeatureCollection" as const, features };
}

/* ── Marker icon helpers ── */

function createIcon(type: string, orgType: string, isHighlighted: boolean, hasHighlights: boolean) {
  if (isHighlighted) {
    return L.divIcon({
      className: "",
      html: `<div style="position:relative;">
        <div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:3px solid #ffffff;box-shadow:0 0 0 3px #f59e0b, 0 2px 8px rgba(0,0,0,0.3);animation:pulse 1.5s ease-in-out infinite;"></div>
      </div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  const color = orgType === "ngo" ? TYPE_COLORS.ngo : (TYPE_COLORS[type] || "#6b7280");
  const opacity = hasHighlights ? 0.25 : 1;
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #0f1623;box-shadow:0 0 6px ${color}40, 0 1px 3px rgba(0,0,0,0.5);opacity:${opacity};"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

/* ── Component ── */

interface Props {
  facilities: Facility[];
  analysis: Analysis | null;
  layers: LayerState;
  selectedSpecialty: string;
  selectedFacility: Facility | null;
  onSelectFacility: (f: Facility | null) => void;
  highlightedNames: Set<string>;
}

export default function MapView({
  facilities,
  analysis,
  layers,
  selectedSpecialty,
  selectedFacility,
  onSelectFacility,
  highlightedNames,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<any>(null);
  const hexLayerRef = useRef<L.GeoJSON | null>(null);

  // Pre-compute hex data once at resolution 5
  const hexData = useMemo(() => {
    if (!analysis) return null;
    return buildHexData(analysis.coverageGrid, 5);
  }, [analysis]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [7.9465, -1.0232],
      zoom: 7,
      zoomControl: true,
      maxBounds: [
        [3.5, -4.0],
        [12.5, 2.5],
      ],
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // H3 hexagonal coverage / desert layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hexData) return;

    // Remove existing hex layer
    if (hexLayerRef.current) {
      map.removeLayer(hexLayerRef.current);
      hexLayerRef.current = null;
    }

    const showDeserts = layers.showDeserts;
    const showCoverage = layers.showCoverage;

    if (!showDeserts && !showCoverage) return;

    const isDesertMode = showDeserts && !showCoverage;

    // Always build all hexes — desert mode uses styling to distinguish severity
    const geojson = hexToGeoJSON(hexData);

    if (geojson.features.length === 0) return;

    const hexLayer = L.geoJSON(geojson as any, {
      style: (feature) => {
        const ci = feature?.properties?.coverageIndex ?? 0;

        if (isDesertMode) {
          // Non-desert hexes: subtle dark fill to show country shape
          if (ci >= 0.5) {
            return {
              fillColor: "#0d1a2a",
              fillOpacity: 0.18,
              color: "#1c2a3a",
              weight: 0.5,
              opacity: 0.15,
            };
          }
          // Desert hexes: red severity palette
          const severity = feature?.properties?.severity ?? 0;
          return {
            fillColor: desertSeverityColor(ci),
            fillOpacity: desertFillOpacity(ci),
            color: severity > 0.6 ? "#ef4444" : "#7f1d1d",
            weight: severity > 0.6 ? 1.8 : 1,
            opacity: desertBorderOpacity(ci),
          };
        }

        // Coverage mode
        return {
          fillColor: coverageToColor(ci),
          fillOpacity: 0.5,
          color: "#1e3a4a",
          weight: 1,
          opacity: 0.5,
        };
      },
      onEachFeature: (feature, layer) => {
        const ci = feature.properties?.coverageIndex ?? 0;
        const fc = feature.properties?.facilityCount ?? 0;
        const severity = feature.properties?.severity ?? 0;
        const pct = (ci * 100).toFixed(0);

        if (isDesertMode) {
          if (ci >= 0.5) {
            // Non-desert: minimal tooltip
            layer.bindTooltip(
              `<div class="hex-tooltip">
                <div style="font-weight:600;font-size:13px;color:#2dd4bf;margin-bottom:2px;">Covered Area</div>
                <div style="font-size:11px;color:#8b97a8;">${fc} facilities nearby &middot; ${pct}% coverage</div>
              </div>`,
              { sticky: true, className: "hex-tooltip-container" }
            );
          } else {
            // Desert: detailed tooltip
            const severityLabel =
              severity >= 0.75
                ? "Critical"
                : severity >= 0.5
                ? "Severe"
                : severity >= 0.25
                ? "Moderate"
                : "Mild";
            const severityColor = desertSeverityColor(ci);
            const barWidth = Math.round(severity * 100);

            layer.bindTooltip(
              `<div class="hex-tooltip hex-tooltip-desert">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                  <div style="width:8px;height:8px;border-radius:50%;background:${severityColor};box-shadow:0 0 6px ${severityColor};flex-shrink:0;"></div>
                  <div style="font-weight:700;font-size:13px;color:#fca5a5;">Medical Desert</div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
                  <span style="font-size:11px;color:#8b97a8;">Coverage</span>
                  <span style="font-size:13px;font-weight:700;color:#e8edf5;">${pct}%</span>
                </div>
                <div style="width:100%;height:4px;background:#1c2a3a;border-radius:2px;overflow:hidden;margin-bottom:6px;">
                  <div style="width:${barWidth}%;height:100%;background:linear-gradient(90deg,${severityColor},#fbbf24);border-radius:2px;transform:scaleX(-1);"></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:11px;color:#6b7a8d;">${fc} facilities nearby</span>
                  <span style="font-size:11px;font-weight:700;color:${severityColor};">${severityLabel}</span>
                </div>
              </div>`,
              { sticky: true, className: "hex-tooltip-container hex-tooltip-desert-container" }
            );
          }
        } else {
          const label =
            ci >= 0.75
              ? "Good"
              : ci >= 0.5
              ? "Moderate"
              : ci >= 0.25
              ? "Poor"
              : "Critical";

          layer.bindTooltip(
            `<div class="hex-tooltip">
              <div style="font-weight:600;font-size:13px;color:#e8edf5;margin-bottom:2px;">Coverage: ${pct}%</div>
              <div style="font-size:11px;color:#8b97a8;">${fc} facilities nearby</div>
              <div style="font-size:11px;color:${coverageToColor(ci)};font-weight:600;margin-top:2px;">${label}</div>
            </div>`,
            { sticky: true, className: "hex-tooltip-container" }
          );
        }

        layer.on("mouseover", function (this: any) {
          if (isDesertMode && ci >= 0.5) {
            this.setStyle({ fillOpacity: 0.3, weight: 1, color: "#2dd4bf" });
          } else if (isDesertMode) {
            this.setStyle({
              fillOpacity: Math.min(desertFillOpacity(ci) + 0.15, 0.95),
              weight: 2.5,
              color: "#fca5a5",
            });
          } else {
            this.setStyle({ fillOpacity: 0.75, weight: 2, color: "#e8edf5" });
          }
        });
        layer.on("mouseout", function (this: any) {
          hexLayer.resetStyle(this);
        });
      },
    });

    hexLayer.addTo(map);
    hexLayerRef.current = hexLayer;

    return () => {
      if (hexLayerRef.current) {
        map.removeLayer(hexLayerRef.current);
        hexLayerRef.current = null;
      }
    };
  }, [hexData, layers.showDeserts, layers.showCoverage]);

  // Update facility markers (reacts to highlights)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }

    if (!layers.showFacilities) return;

    const hasHighlights = highlightedNames.size > 0;

    const cluster = (L as any).markerClusterGroup({
      maxClusterRadius: hasHighlights ? 30 : 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (c: any) => {
        const count = c.getChildCount();
        const size = count < 10 ? 36 : count < 50 ? 44 : 52;
        const opacity = hasHighlights ? 0.4 : 1;
        return L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(232,237,245,0.92);border:2px solid #9ca3af;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${count < 10 ? 14 : 13}px;color:#1f2937;box-shadow:0 2px 8px rgba(0,0,0,0.25);opacity:${opacity};">${count}</div>`,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    const highlightedMarkers: L.Marker[] = [];

    facilities.forEach((f) => {
      const isHighlighted = highlightedNames.has(f.name);
      const icon = createIcon(f.type, f.orgType, isHighlighted, hasHighlights);
      const marker = L.marker([f.lat, f.lon], {
        icon,
        zIndexOffset: isHighlighted ? 1000 : 0,
      });

      const highlightBadge = isHighlighted
        ? `<div style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-bottom:4px;display:inline-block;">CHAT RESULT</div>`
        : "";

      const specHtml = f.specialties.length
        ? `<div style="margin-top:4px;font-size:11px;color:#6b7a8d;">${f.specialties.slice(0, 5).join(", ")}</div>`
        : "";
      const metaHtml = [
        f.type &&
          `<span style="background:#1a2538;padding:1px 6px;border-radius:4px;font-size:11px;color:#8b97a8;">${f.type}</span>`,
        f.doctors &&
          `<span style="font-size:11px;color:#8b97a8;">\u{1F9D1}\u{200D}\u{2695}\u{FE0F} ${f.doctors} doctors</span>`,
        f.beds &&
          `<span style="font-size:11px;color:#8b97a8;">\u{1F6CF}\u{FE0F} ${f.beds} beds</span>`,
      ]
        .filter(Boolean)
        .join(" &middot; ");

      marker.bindPopup(
        `<div style="min-width:220px;">
          ${highlightBadge}
          <div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#e8edf5;">${f.name}</div>
          <div style="font-size:12px;color:#6b7a8d;">${f.city}${f.region ? ", " + f.region : ""}</div>
          ${metaHtml ? `<div style="margin-top:6px;">${metaHtml}</div>` : ""}
          ${specHtml}
          ${f.procedures.length ? `<div style="margin-top:4px;font-size:11px;color:#8b97a8;"><b style="color:#c4cdd9;">Procedures:</b> ${f.procedures.slice(0, 3).join("; ")}</div>` : ""}
          ${f.equipment.length ? `<div style="font-size:11px;color:#8b97a8;"><b style="color:#c4cdd9;">Equipment:</b> ${f.equipment.slice(0, 3).join("; ")}</div>` : ""}
        </div>`,
        { maxWidth: 350 }
      );

      marker.on("click", () => onSelectFacility(f));

      if (isHighlighted) {
        marker.addTo(map);
        highlightedMarkers.push(marker);
      } else {
        cluster.addLayer(marker);
      }
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;
    (clusterRef.current as any)._highlightedMarkers = highlightedMarkers;

    if (hasHighlights && highlightedMarkers.length > 0) {
      const group = L.featureGroup(highlightedMarkers);
      map.fitBounds(group.getBounds().pad(0.3), { animate: true, maxZoom: 10 });
    }

    return () => {
      highlightedMarkers.forEach((m) => map.removeLayer(m));
    };
  }, [facilities, layers.showFacilities, highlightedNames]);

  // Pan to selected facility
  useEffect(() => {
    if (selectedFacility && mapRef.current) {
      mapRef.current.setView([selectedFacility.lat, selectedFacility.lon], 12, { animate: true });
    }
  }, [selectedFacility]);

  return <div ref={containerRef} className="w-full h-full" />;
}
