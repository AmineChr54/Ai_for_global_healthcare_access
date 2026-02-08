'use client';

import MapGL, { Layer, MapRef, Marker, Popup, Source } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Supercluster from 'supercluster';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, Point } from 'geojson';
import type { FacilityWithDerived } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatConfidence } from '@/lib/utils';
import { Activity, MapPin, Shield, Thermometer } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import type { MapBounds } from '@/lib/map-data/geo';
import type { MapLayerData } from '@/lib/map-data/get-map-layers';
import { getMapLayers } from '@/lib/map-data/get-map-layers';
import { getPseudoCoordinates } from '@/lib/map-data/geo';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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
}: LivingMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const { theme } = useTheme();
  const [viewState, setViewState] = useState({ longitude: -1.02, latitude: 7.95, zoom: 6 });
  const [layers, setLayers] = useState<Record<MapLayerKey, boolean>>({ facilities: true, heat: true });
  const [activePoint, setActivePoint] = useState<FacilityWithDerived | null>(null);
  const [hoveredDesert, setHoveredDesert] = useState<{
    lng: number;
    lat: number;
    intensity: number;
    score: number;
    facilityCount: number;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const resolvedLayerData = useMemo(() => layerData ?? getMapLayers(facilities), [layerData, facilities]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    const target = facilities.find((facility) => facility.id === selectedFacilityId);
    if (!target) return;
    const coords = target.latitude && target.longitude ? { lng: target.longitude, lat: target.latitude } : getPseudoCoordinates(target.id, target.region);
    setViewState((prev) => ({ ...prev, longitude: coords.lng, latitude: coords.lat, zoom: Math.max(prev.zoom, 7.5) }));
    setActivePoint(target);
  }, [selectedFacilityId, facilities]);

  const geojson = useMemo(() => {
    return resolvedLayerData.facilityPoints;
  }, [resolvedLayerData]);

  const supercluster = useMemo(() => {
    return new Supercluster<{ facilityId: string; confidence: number }>({ radius: 60, maxZoom: 16 }).load(
      geojson.features as Feature<Point, { facilityId: string; confidence: number }>[]
    );
  }, [geojson]);

  const clusters = useMemo(() => {
    return supercluster.getClusters([-20, -40, 60, 40], Math.round(viewState.zoom));
  }, [supercluster, viewState.zoom]);

  const facilityMap = useMemo(() => new globalThis.Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const facilityCoords = useMemo(
    () =>
      new globalThis.Map(
        resolvedLayerData.facilityPoints.features.map((feature) => [
          feature.properties?.facilityId,
          feature.geometry.coordinates as [number, number],
        ])
      ),
    [resolvedLayerData]
  );

  const expandCluster = (clusterId: number, coordinates: [number, number]) => {
    const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(clusterId), 16);
    mapRef.current?.flyTo({ center: coordinates, zoom: expansionZoom, duration: 600 });
  };

  const markerTone = (facility: FacilityWithDerived) => {
    const equipment = facility.equipment?.toLowerCase() ?? '';
    const capabilities = facility.capabilities?.toLowerCase() ?? '';
    if (facility.flags?.length) return 'red';
    if (equipment.includes('oxygen') || capabilities.includes('oxygen')) return 'green';
    if (capabilities.includes('icu')) return 'amber';
    return 'neutral';
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-10 text-center text-[color:var(--text-muted)]">
        <Layers className="mb-4 h-10 w-10 text-[color:var(--text-muted)]" />
        <p className="text-lg font-semibold text-[color:var(--text-primary)]">Add a Mapbox token</p>
        <p className="text-sm text-[color:var(--text-muted)]">
          Set <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your <code>.env.local</code> to render the
          Living Map. All other functionality will keep working.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-white/10">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapLib={mapboxgl}
        mapStyle={theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'}
        {...viewState}
        onLoad={() => setMapReady(true)}
        interactiveLayerIds={['heat-polygons-fill']}
        onMove={(event) => {
          setViewState(event.viewState);
          if (onBoundsChange && mapRef.current) {
            const bounds = mapRef.current.getBounds();
            onBoundsChange({
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            });
          }
        }}
        onMouseMove={(event) => {
          const feature = event.features?.[0];
          if (feature && feature.layer?.id === 'heat-polygons-fill') {
            const props = feature.properties as unknown as { intensity: number; score: number; facilityCount: number };
            setHoveredDesert({
              lng: event.lngLat.lng,
              lat: event.lngLat.lat,
              intensity: Number(props.intensity ?? 0),
              score: Number(props.score ?? 0),
              facilityCount: Number(props.facilityCount ?? 0),
            });
          } else {
            setHoveredDesert(null);
          }
        }}
        onMouseLeave={() => setHoveredDesert(null)}
      >
        {layers.heat && (
          <Source id="heat-polygons" type="geojson" data={resolvedLayerData.heatPolygons}>
            <Layer
              id="heat-polygons-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'intensity'],
                  0,
                  'rgba(68, 168, 120, 0.18)',
                  0.2,
                  'rgba(112, 193, 150, 0.32)',
                  0.4,
                  'rgba(245, 214, 186, 0.4)',
                  0.6,
                  'rgba(238, 164, 140, 0.52)',
                  0.8,
                  'rgba(228, 120, 108, 0.62)',
                  1,
                  'rgba(207, 90, 92, 0.72)',
                ],
                'fill-opacity': 0.85,
                'fill-outline-color': 'rgba(255,255,255,0.2)',
              }}
            />
          </Source>
        )}


        {layers.facilities &&
          clusters.map((cluster) => {
            const [longitude, latitude] = cluster.geometry.coordinates as [number, number];
            const isCluster = cluster.properties?.cluster;
            if (isCluster) {
              return (
                <Marker key={`cluster-${cluster.id}`} latitude={latitude} longitude={longitude} anchor="center">
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-accent-blue/30 text-white shadow-xl backdrop-blur"
                    onClick={() => expandCluster(cluster.id as number, [longitude, latitude])}
                  >
                    <span className="text-sm font-semibold">{cluster.properties?.point_count_abbreviated}</span>
                  </button>
                </Marker>
              );
            }
            const facilityId = cluster.properties?.facilityId as string;
            const facility = facilityMap.get(facilityId);
            const coords = facilityCoords.get(facilityId) ?? [longitude, latitude];
            if (!facility) return null;
            return (
              <Marker
                key={facility.id}
                longitude={coords[0]}
                latitude={coords[1]}
                anchor="bottom"
                onClick={() => {
                  setActivePoint(facility);
                  onSelectFacility(facility.id);
                }}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border shadow-lg transition hover:scale-105',
                    markerTone(facility) === 'green' && 'border-emerald-400/50 bg-emerald-400/20 text-emerald-200',
                    markerTone(facility) === 'amber' && 'border-amber-400/50 bg-amber-400/20 text-amber-200',
                    markerTone(facility) === 'red' && 'border-red-400/60 bg-red-400/25 text-red-200',
                    markerTone(facility) === 'neutral' &&
                      'border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] text-[color:var(--text-primary)]',
                    facility.id === selectedFacilityId && 'ring-2 ring-accent-blue'
                  )}
                >
                  <MapPin className="h-4 w-4" />
                </div>
              </Marker>
            );
          })}

        {activePoint && (
          <Popup
            longitude={(facilityCoords.get(activePoint.id)?.[0] ?? activePoint.longitude ?? 0) as number}
            latitude={(facilityCoords.get(activePoint.id)?.[1] ?? activePoint.latitude ?? 0) as number}
            anchor="top"
            closeButton={false}
            className="rounded-2xl border border-white/10 bg-[color:var(--bg-panel)] p-4 text-[color:var(--text-primary)]"
            onClose={() => setActivePoint(null)}
          >
            <p className="text-sm font-semibold">{activePoint.name}</p>
            <p className="text-xs text-[color:var(--text-muted)]">{activePoint.region}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
              <Shield className="h-3.5 w-3.5 text-accent-blue" />
              {activePoint.type ?? 'Unknown type'}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
              <Activity className="h-3.5 w-3.5 text-amber-300" />
              {activePoint.capabilities?.split(',').slice(0, 2).join(', ') || 'No capabilities listed'}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
              <span>Confidence: {formatConfidence(activePoint.confidence)}</span>
              <Button size="sm" variant="secondary" className="px-3 py-1 text-[11px]" onClick={() => onSelectFacility(activePoint.id)}>
                Open details
              </Button>
            </div>
            {activePoint.flags.length > 0 && (
              <div className="mt-3 space-y-1">
                {activePoint.flags.map((flag) => (
                  <Badge key={flag.message} variant="warning" className="text-[10px] uppercase tracking-wide">
                    {flag.message}
                  </Badge>
                ))}
              </div>
            )}
          </Popup>
        )}

        {hoveredDesert && (
          <Popup
            longitude={hoveredDesert.lng}
            latitude={hoveredDesert.lat}
            anchor="bottom"
            closeButton={false}
            className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-3 text-[color:var(--text-primary)]"
          >
            <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Medical desert index</p>
            <p className="mt-1 text-sm font-semibold">
              {Math.round(hoveredDesert.intensity * 100)}% underserved
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-emerald-400/30">
              <div
                className="h-full rounded-full bg-red-400/70"
                style={{ width: `${Math.round(hoveredDesert.intensity * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-[10px] text-[color:var(--text-muted)]">
              Coverage score: {hoveredDesert.score.toFixed(1)} · Facilities: {hoveredDesert.facilityCount}
            </div>
          </Popup>
        )}
      </MapGL>

      <div className="pointer-events-auto absolute left-4 top-4 flex flex-wrap gap-2 rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-2 text-xs">
        <LayerToggle
          icon={<MapPin className="h-3 w-3" />}
          label="Facilities"
          active={layers.facilities}
          onClick={() => setLayers((prev) => ({ ...prev, facilities: !prev.facilities }))}
        />
        <LayerToggle
          icon={<Thermometer className="h-3 w-3" />}
          label="Medical desert heat"
          active={layers.heat}
          onClick={() => setLayers((prev) => ({ ...prev, heat: !prev.heat }))}
        />
        <details className="group relative">
          <summary className="cursor-pointer list-none rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
            Specialty {selectedSpecialties.length ? `(${selectedSpecialties.length})` : ''}
          </summary>
          <div className="absolute left-0 top-9 z-10 w-64 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-3 shadow-glass">
            <p className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Suggestions</p>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
              {specialtyOptions.map((specialty) => (
                <label key={specialty} className="flex items-center justify-between text-xs text-[color:var(--text-primary)]">
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
                  <span key={item} className="rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>

      {mapReady && (
        <div className="pointer-events-auto absolute right-4 bottom-4 flex flex-col gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-2 text-xs">
          <button
            className="rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-[color:var(--text-primary)]"
            onClick={() => mapRef.current?.zoomIn()}
          >
            +
          </button>
          <button
            className="rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-[color:var(--text-primary)]"
            onClick={() => mapRef.current?.zoomOut()}
          >
            -
          </button>
        </div>
      )}
    </div>
  );
}

function LayerToggle({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
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
      {icon}
      {label}
    </button>
  );
}
