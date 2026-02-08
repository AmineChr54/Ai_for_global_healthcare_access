'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import type { FacilityWithDerived } from '@/types';
import type { MapBounds } from '@/lib/map-data/geo';
import type { MapLayerData } from '@/lib/map-data/get-map-layers';
import { getPseudoCoordinates } from '@/lib/map-data/geo';
import { cn } from '@/lib/utils';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export type MapLayerKey = 'facilities' | 'heat';

interface LivingMapProps {
  facilities: FacilityWithDerived[];
  layerData?: MapLayerData;
  selectedFacilityId?: string | null;
  onSelectFacility: (facilityId: string) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  specialtyOptions: string[];
  selectedSpecialties: string[];
  onSelectSpecialties: (specialties: string[]) => void;
  highlightedFacilityIds?: Set<string>;
  analysisData?: any;
}

function getCoords(facility: FacilityWithDerived) {
  if (facility.latitude && facility.longitude) {
    return { lat: facility.latitude, lng: facility.longitude };
  }
  return getPseudoCoordinates(facility.id, facility.region);
}

function markerColor(facility: FacilityWithDerived) {
  const equipment = facility.equipment?.toLowerCase() ?? '';
  const capabilities = facility.capabilities?.toLowerCase() ?? '';
  if (facility.flags?.length) return '#ef4444';
  if (equipment.includes('oxygen') || capabilities.includes('oxygen')) return '#34d399';
  if (capabilities.includes('icu')) return '#fbbf24';
  return '#6366f1';
}

function createMarkerIcon(facility: FacilityWithDerived, isHighlighted: boolean, hasHighlights: boolean) {
  if (isHighlighted) {
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;">
        <div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:3px solid #ffffff;box-shadow:0 0 0 3px #f59e0b, 0 2px 8px rgba(0,0,0,0.3);animation:pulse 1.5s ease-in-out infinite;"></div>
      </div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  const color = markerColor(facility);
  const opacity = hasHighlights ? 0.25 : 1;
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);opacity:${opacity};transition:opacity 0.3s;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function LivingMap({
  facilities,
  layerData,
  selectedFacilityId,
  onSelectFacility,
  onBoundsChange,
  specialtyOptions,
  selectedSpecialties,
  onSelectSpecialties,
  highlightedFacilityIds,
  analysisData,
}: LivingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const highlightMarkersRef = useRef<L.Marker[]>([]);
  const heatLayerRef = useRef<any>(null);
  const desertLayerRef = useRef<any>(null);
  const [layers, setLayers] = useState<Record<MapLayerKey, boolean>>({ facilities: true, heat: true });

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [7.9465, -1.0232],
      zoom: 7,
      zoomControl: false,
      maxBounds: [
        [3.5, -4.0],
        [12.5, 2.5],
      ],
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    // Report bounds on move
    const reportBounds = () => {
      if (onBoundsChange && mapRef.current) {
        const bounds = mapRef.current.getBounds();
        onBoundsChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        });
      }
    };

    map.on('moveend', reportBounds);
    // Small delay for initial bounds
    setTimeout(reportBounds, 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update facility markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up previous markers
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }
    highlightMarkersRef.current.forEach((m) => map.removeLayer(m));
    highlightMarkersRef.current = [];

    if (!layers.facilities) return;

    const hasHighlights = (highlightedFacilityIds?.size ?? 0) > 0;

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
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    const highlightedMarkers: L.Marker[] = [];

    facilities.forEach((f) => {
      const isHighlighted = highlightedFacilityIds?.has(f.id) ?? false;
      const coords = getCoords(f);
      const icon = createMarkerIcon(f, isHighlighted, hasHighlights);
      const marker = L.marker([coords.lat, coords.lng], {
        icon,
        zIndexOffset: isHighlighted ? 1000 : 0,
      });

      const highlightBadge = isHighlighted
        ? `<div style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-bottom:4px;display:inline-block;">CHAT RESULT</div>`
        : '';

      const specList = f.specialties
        ? f.specialties
            .split(/,|;/)
            .slice(0, 5)
            .map((s: string) => s.trim())
            .filter(Boolean)
            .join(', ')
        : '';
      const specHtml = specList
        ? `<div style="margin-top:4px;font-size:11px;color:var(--text-muted);">${specList}</div>`
        : '';

      const meta = [
        f.type &&
          `<span style="background:rgba(255,255,255,0.1);padding:1px 6px;border-radius:4px;font-size:11px;">${f.type}</span>`,
      ]
        .filter(Boolean)
        .join(' &middot; ');

      marker.bindPopup(
        `<div style="min-width:220px;">
          ${highlightBadge}
          <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${f.name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${f.district ?? ''}${f.region ? (f.district ? ', ' : '') + f.region : ''}</div>
          ${meta ? `<div style="margin-top:6px;">${meta}</div>` : ''}
          ${specHtml}
          ${f.capabilities ? `<div style="margin-top:4px;font-size:11px;"><b>Capabilities:</b> ${f.capabilities.split(',').slice(0, 3).join(', ')}</div>` : ''}
          ${f.equipment ? `<div style="font-size:11px;"><b>Equipment:</b> ${f.equipment.split(',').slice(0, 3).join(', ')}</div>` : ''}
        </div>`,
        { maxWidth: 350 }
      );

      marker.on('click', () => onSelectFacility(f.id));

      if (isHighlighted) {
        marker.addTo(map);
        highlightedMarkers.push(marker);
      } else {
        cluster.addLayer(marker);
      }
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;
    highlightMarkersRef.current = highlightedMarkers;

    // Auto-zoom to highlighted facilities
    if (hasHighlights && highlightedMarkers.length > 0) {
      const group = L.featureGroup(highlightedMarkers);
      map.fitBounds(group.getBounds().pad(0.3), { animate: true, maxZoom: 10 });
    }

    return () => {
      highlightedMarkers.forEach((m) => map.removeLayer(m));
    };
  }, [facilities, highlightedFacilityIds, layers.facilities]);

  // Medical desert heat layer (from layerData GeoJSON polygons)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (!layers.heat || !layerData?.heatPolygons) return;

    const geoLayer = L.geoJSON(layerData.heatPolygons as any, {
      style: (feature) => {
        const intensity = feature?.properties?.intensity ?? 0;
        let color: string;
        if (intensity < 0.3) {
          color = `rgba(68, 168, 120, ${0.15 + intensity * 0.4})`;
        } else if (intensity < 0.6) {
          color = `rgba(245, 214, 186, ${0.25 + intensity * 0.4})`;
        } else {
          color = `rgba(207, 90, 92, ${0.3 + intensity * 0.4})`;
        }
        return {
          fillColor: color,
          fillOpacity: 0.85,
          color: 'rgba(255,255,255,0.15)',
          weight: 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        if (props) {
          layer.bindPopup(
            `<div style="min-width:150px;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Medical desert index</div>
              <div style="font-size:14px;font-weight:600;margin-top:4px;">${Math.round(props.intensity * 100)}% underserved</div>
              <div style="margin-top:6px;height:6px;border-radius:9999px;background:rgba(52,211,153,0.3);overflow:hidden;">
                <div style="height:100%;border-radius:9999px;background:rgba(239,68,68,0.7);width:${Math.round(props.intensity * 100)}%"></div>
              </div>
              <div style="margin-top:6px;font-size:10px;color:var(--text-muted);">Coverage: ${(props.score ?? 0).toFixed(1)} · Facilities: ${props.facilityCount ?? 0}</div>
            </div>`,
            { maxWidth: 250 }
          );
        }
      },
    });

    geoLayer.addTo(map);
    heatLayerRef.current = geoLayer;

    return () => {
      if (heatLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(heatLayerRef.current);
      }
    };
  }, [layerData, layers.heat]);

  // Additional heatmap from analysis coverage grid
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !analysisData?.coverageGrid) return;

    if (desertLayerRef.current) {
      map.removeLayer(desertLayerRef.current);
      desertLayerRef.current = null;
    }

    if (!layers.heat) return;

    const points = analysisData.coverageGrid
      .filter((p: any) => p.coverageIndex < 0.5)
      .map((p: any) => [p.lat, p.lon, 1 - p.coverageIndex] as [number, number, number]);

    if (points.length > 0) {
      desertLayerRef.current = (L as any).heatLayer(points, {
        radius: 30,
        blur: 25,
        maxZoom: 10,
        max: 1.0,
        gradient: { 0.2: '#fef9c3', 0.5: '#fdba74', 0.7: '#f87171', 1.0: '#991b1b' },
      });
      desertLayerRef.current.addTo(map);
    }
  }, [analysisData, layers.heat]);

  // Pan to selected facility
  useEffect(() => {
    if (!selectedFacilityId || !mapRef.current) return;
    const target = facilities.find((f) => f.id === selectedFacilityId);
    if (!target) return;
    const coords = getCoords(target);
    mapRef.current.setView([coords.lat, coords.lng], Math.max(mapRef.current.getZoom(), 10), {
      animate: true,
    });
  }, [selectedFacilityId]);

  const toggleLayer = useCallback((key: MapLayerKey) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="relative h-full overflow-hidden rounded-3xl">
      <div ref={containerRef} className="h-full w-full" />

      {/* Layer toggles */}
      <div className="pointer-events-auto absolute left-4 top-4 z-[1000] flex flex-wrap gap-2 rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-2 text-xs backdrop-blur-sm">
        <LayerToggle
          label="Facilities"
          active={layers.facilities}
          onClick={() => toggleLayer('facilities')}
        />
        <LayerToggle
          label="Medical deserts"
          active={layers.heat}
          onClick={() => toggleLayer('heat')}
        />
        <details className="group relative">
          <summary className="cursor-pointer list-none rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
            Specialty {selectedSpecialties.length ? `(${selectedSpecialties.length})` : ''}
          </summary>
          <div className="absolute left-0 top-9 z-10 w-64 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-3 shadow-glass backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
              Filter by specialty
            </p>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
              {specialtyOptions.map((specialty) => (
                <label
                  key={specialty}
                  className="flex items-center justify-between text-xs text-[color:var(--text-primary)]"
                >
                  <span className="capitalize">{specialty}</span>
                  <input
                    type="checkbox"
                    checked={selectedSpecialties.includes(specialty)}
                    onChange={() =>
                      onSelectSpecialties(
                        selectedSpecialties.includes(specialty)
                          ? selectedSpecialties.filter((item) => item !== specialty)
                          : [...selectedSpecialties, specialty]
                      )
                    }
                  />
                </label>
              ))}
            </div>
            {selectedSpecialties.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[color:var(--text-muted)]">
                {selectedSpecialties.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Zoom controls */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-[1000] flex flex-col gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-2 text-xs backdrop-blur-sm">
        <button
          className="rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-[color:var(--text-primary)] transition hover:bg-white/10"
          onClick={() => mapRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          className="rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-[color:var(--text-primary)] transition hover:bg-white/10"
          onClick={() => mapRef.current?.zoomOut()}
        >
          −
        </button>
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-full border px-3 py-1 transition',
        active
          ? 'border-accent-blue bg-accent-blue/20 text-[color:var(--text-primary)]'
          : 'border-[color:var(--border-subtle)] text-[color:var(--text-muted)] hover:border-white/30'
      )}
    >
      {label}
    </button>
  );
}
