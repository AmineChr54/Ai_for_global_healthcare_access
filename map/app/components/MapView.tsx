"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.heat";
import type { Facility, Analysis, LayerState } from "@/types";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const TYPE_COLORS: Record<string, string> = {
  hospital: "#2563eb",
  clinic: "#16a34a",
  doctor: "#9333ea",
  pharmacy: "#ea580c",
  dentist: "#0d9488",
  ngo: "#dc2626",
};

function createIcon(type: string, orgType: string, isHighlighted: boolean, hasHighlights: boolean) {
  if (isHighlighted) {
    // Gold pulsing marker for chat-highlighted facilities
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
  const opacity = hasHighlights ? 0.25 : 1; // Dim non-highlighted when highlights exist
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);opacity:${opacity};"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

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
  const desertLayerRef = useRef<any>(null);
  const coverageLayerRef = useRef<any>(null);
  const populationLayerRef = useRef<any>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [7.9465, -1.0232],
      zoom: 7,
      zoomControl: true,
      maxBounds: [[3.5, -4.0], [12.5, 2.5]],
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:white;border:2px solid #6366f1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${count < 10 ? 13 : 12}px;color:#1e293b;box-shadow:0 2px 8px rgba(0,0,0,0.15);opacity:${opacity};">${count}</div>`,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    // Add highlighted facilities as individual markers (NOT clustered) so they always show
    const highlightedMarkers: L.Marker[] = [];

    facilities.forEach((f) => {
      const isHighlighted = highlightedNames.has(f.name);
      const icon = createIcon(f.type, f.orgType, isHighlighted, hasHighlights);
      const marker = L.marker([f.lat, f.lon], {
        icon,
        zIndexOffset: isHighlighted ? 1000 : 0,
      });

      const highlightBadge = isHighlighted
        ? `<div style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-bottom:4px;display:inline-block;">CHAT RESULT</div>`
        : "";

      const specHtml = f.specialties.length
        ? `<div style="margin-top:4px;font-size:11px;color:#6b7280;">${f.specialties.slice(0, 5).join(", ")}</div>`
        : "";
      const metaHtml = [
        f.type && `<span style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:11px;">${f.type}</span>`,
        f.doctors && `<span style="font-size:11px;">👨‍⚕️ ${f.doctors} doctors</span>`,
        f.beds && `<span style="font-size:11px;">🛏️ ${f.beds} beds</span>`,
      ].filter(Boolean).join(" &middot; ");

      marker.bindPopup(
        `<div style="min-width:220px;">
          ${highlightBadge}
          <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${f.name}</div>
          <div style="font-size:12px;color:#6b7280;">${f.city}${f.region ? ", " + f.region : ""}</div>
          ${metaHtml ? `<div style="margin-top:6px;">${metaHtml}</div>` : ""}
          ${specHtml}
          ${f.procedures.length ? `<div style="margin-top:4px;font-size:11px;"><b>Procedures:</b> ${f.procedures.slice(0, 3).join("; ")}</div>` : ""}
          ${f.equipment.length ? `<div style="font-size:11px;"><b>Equipment:</b> ${f.equipment.slice(0, 3).join("; ")}</div>` : ""}
        </div>`,
        { maxWidth: 350 }
      );

      marker.on("click", () => onSelectFacility(f));

      if (isHighlighted) {
        // Add highlighted markers directly to map (not cluster) so they always show
        marker.addTo(map);
        highlightedMarkers.push(marker);
      } else {
        cluster.addLayer(marker);
      }
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;

    // Store highlighted markers for cleanup
    (clusterRef.current as any)._highlightedMarkers = highlightedMarkers;

    // Auto-zoom to fit highlighted facilities
    if (hasHighlights && highlightedMarkers.length > 0) {
      const group = L.featureGroup(highlightedMarkers);
      map.fitBounds(group.getBounds().pad(0.3), { animate: true, maxZoom: 10 });
    }

    return () => {
      // Clean up individual highlighted markers
      highlightedMarkers.forEach((m) => map.removeLayer(m));
    };
  }, [facilities, layers.showFacilities, highlightedNames]);

  // Medical desert heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !analysis) return;

    if (desertLayerRef.current) {
      map.removeLayer(desertLayerRef.current);
      desertLayerRef.current = null;
    }

    if (!layers.showDeserts) return;

    const points = analysis.coverageGrid
      .filter((p) => p.coverageIndex < 0.5)
      .map((p) => [p.lat, p.lon, 1 - p.coverageIndex] as [number, number, number]);

    if (points.length > 0) {
      desertLayerRef.current = (L as any).heatLayer(points, {
        radius: 30,
        blur: 25,
        maxZoom: 10,
        max: 1.0,
        gradient: { 0.2: "#fef9c3", 0.5: "#fdba74", 0.7: "#f87171", 1.0: "#991b1b" },
      });
      desertLayerRef.current.addTo(map);
    }
  }, [analysis, layers.showDeserts]);

  // Hospital coverage layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !analysis) return;

    if (coverageLayerRef.current) {
      map.removeLayer(coverageLayerRef.current);
      coverageLayerRef.current = null;
    }

    if (!layers.showCoverage) return;

    const points = analysis.coverageGrid.map(
      (p) => [p.lat, p.lon, p.coverageIndex] as [number, number, number]
    );

    if (points.length > 0) {
      coverageLayerRef.current = (L as any).heatLayer(points, {
        radius: 25,
        blur: 20,
        maxZoom: 10,
        max: 1.0,
        gradient: { 0.0: "#fee2e2", 0.3: "#fecaca", 0.5: "#fde68a", 0.7: "#bbf7d0", 1.0: "#166534" },
      });
      coverageLayerRef.current.addTo(map);
    }
  }, [analysis, layers.showCoverage]);

  // Population underserved layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !analysis) return;

    if (populationLayerRef.current) {
      map.removeLayer(populationLayerRef.current);
      populationLayerRef.current = null;
    }

    if (!layers.showPopulation) return;

    const points: [number, number, number][] = [];
    const regionCoords: Record<string, [number, number]> = {
      "Greater Accra": [5.6037, -0.187], "Ashanti": [6.747, -1.5209],
      "Western": [5.09, -1.94], "Central": [5.3, -1.1],
      "Eastern": [6.2, -0.5], "Volta": [6.7, 0.5],
      "Northern": [9.5, -1.0], "Upper East": [10.8, -0.8],
      "Upper West": [10.3, -2.4], "Bono": [7.5, -2.3],
      "Bono East": [7.8, -1.5], "Ahafo": [6.9, -2.4],
      "Oti": [8.0, 0.5], "Savannah": [9.0, -1.8],
      "Western North": [6.2, -2.5], "North East": [10.5, -0.3],
    };

    for (const [region, pop] of Object.entries(analysis.regionPopulation)) {
      const coords = regionCoords[region];
      if (!coords) continue;
      const stats = Object.entries(analysis.regionStats).find(
        ([k]) => k.toLowerCase().includes(region.toLowerCase()) || region.toLowerCase().includes(k.toLowerCase())
      );
      const facCount = stats ? stats[1].facilities : 1;
      const ratio = pop / Math.max(facCount, 1);
      const intensity = Math.min(ratio / layers.populationThreshold, 1.0);
      points.push([coords[0], coords[1], intensity]);
    }

    if (points.length > 0) {
      populationLayerRef.current = (L as any).heatLayer(points, {
        radius: 60, blur: 40, maxZoom: 10, max: 1.0,
        gradient: { 0.0: "#dbeafe", 0.3: "#93c5fd", 0.5: "#fbbf24", 0.7: "#f97316", 1.0: "#dc2626" },
      });
      populationLayerRef.current.addTo(map);
    }
  }, [analysis, layers.showPopulation, layers.populationThreshold]);

  // Pan to selected facility
  useEffect(() => {
    if (selectedFacility && mapRef.current) {
      mapRef.current.setView([selectedFacility.lat, selectedFacility.lon], 12, { animate: true });
    }
  }, [selectedFacility]);

  return <div ref={containerRef} className="w-full h-full" />;
}
