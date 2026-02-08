import type { FeatureCollection, Polygon } from 'geojson';
import type { FacilityWithDerived } from '@/types';
import { facilityCoverageScore, normalizeScore } from './desert-metrics';
import { getPseudoCoordinates } from './geo';
import { GHANA_BORDER } from './ghana-border';
import { pointInPolygon } from './point-in-polygon';

const GRID_BOUNDS = {
  west: -3.5,
  east: 1.5,
  south: 4.5,
  north: 11.5,
};

const GRID_SIZE = 0.12;

const HEX_VERTICAL_STEP = 1.5 * GRID_SIZE;
const HEX_HORIZONTAL_STEP = Math.sqrt(3) * GRID_SIZE;

function hexVertices(center: [number, number], size: number) {
  const [cx, cy] = center;
  const vertices: [number, number][] = [];
  const angles = [30, 90, 150, 210, 270, 330];
  for (const angle of angles) {
    const rad = (Math.PI / 180) * angle;
    const x = cx + size * Math.cos(rad);
    const y = cy + size * Math.sin(rad);
    vertices.push([x, y]);
  }
  vertices.push(vertices[0]);
  return vertices;
}

function matchesSpecialty(facility: FacilityWithDerived, selected: string[]) {
  if (!selected.length) return true;
  const hay = `${facility.specialties ?? ''} ${facility.capabilities ?? ''} ${facility.services ?? ''}`.toLowerCase();
  return selected.some((token) => hay.includes(token.toLowerCase()));
}

export function buildDesertPolygons(
  facilities: FacilityWithDerived[],
  selectedSpecialties: string[] = []
): FeatureCollection<Polygon, { id: string; intensity: number; score: number; facilityCount: number }> {
  const polygons: FeatureCollection<Polygon, { id: string; intensity: number; score: number; facilityCount: number }> = {
    type: 'FeatureCollection',
    features: [],
  };

  const facilityPoints = facilities.filter((facility) => matchesSpecialty(facility, selectedSpecialties)).map((facility) => {
    const coords = facility.latitude && facility.longitude
      ? { lat: facility.latitude, lng: facility.longitude }
      : getPseudoCoordinates(facility.id, facility.region);
    return {
      lat: coords.lat,
      lng: coords.lng,
      score: facilityCoverageScore(facility),
    };
  });

  let maxScore = 0;
  let row = 0;
  for (let lat = GRID_BOUNDS.south; lat < GRID_BOUNDS.north; lat += HEX_VERTICAL_STEP) {
    const xOffset = row % 2 === 0 ? 0 : HEX_HORIZONTAL_STEP / 2;
    for (let lng = GRID_BOUNDS.west + xOffset; lng < GRID_BOUNDS.east; lng += HEX_HORIZONTAL_STEP) {
      const center: [number, number] = [lng, lat];
      if (!pointInPolygon(center, GHANA_BORDER)) continue;

      const radius = GRID_SIZE * 2.2;
      const cellFacilities = facilityPoints.filter((point) => {
        const dx = point.lng - lng;
        const dy = point.lat - lat;
        return dx * dx + dy * dy <= radius * radius;
      });

      const cellScore = cellFacilities.reduce((sum, item) => sum + item.score, 0);
      const facilityCount = cellFacilities.length;
      maxScore = Math.max(maxScore, cellScore);

      polygons.features.push({
        type: 'Feature',
        properties: { id: `hex-${lat.toFixed(2)}-${lng.toFixed(2)}`, intensity: 0, score: cellScore, facilityCount },
        geometry: {
          type: 'Polygon',
          coordinates: [hexVertices(center, GRID_SIZE)],
        },
      });
    }
    row += 1;
  }

  polygons.features = polygons.features.map((feature) => {
    const normalized = normalizeScore(feature.properties.score, maxScore || 1);
    const seed = feature.properties.score * 7.9 + feature.properties.facilityCount * 1.7;
    const jitter = (Math.sin(seed) + 1) / 30;
    const coords = feature.geometry.coordinates[0];
    const center = coords.reduce(
      (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
      { x: 0, y: 0 }
    );
    const centroid = { x: center.x / coords.length, y: center.y / coords.length };
    const spatial = (Math.sin(centroid.y * 3.4) + Math.cos(centroid.x * 2.7)) / 12;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        intensity: Math.min(1, Math.max(0, 1 - normalized + jitter + spatial)),
      },
    };
  });

  return polygons;
}
