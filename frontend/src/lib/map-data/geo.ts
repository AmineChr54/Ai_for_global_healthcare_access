export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

// Inlined from data-loader to avoid importing CSV/Mapbox dependencies
const REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "greater accra": { lat: 5.6037, lng: -0.187 },
  "ashanti": { lat: 6.6904, lng: -1.6244 },
  "western": { lat: 4.904, lng: -1.759 },
  "central": { lat: 5.6145, lng: -0.2295 },
  "volta": { lat: 6.578, lng: 0.45 },
  "eastern": { lat: 6.0915, lng: -0.4516 },
  "northern": { lat: 9.3992, lng: -0.8393 },
  "upper east": { lat: 10.7082, lng: -0.9644 },
  "upper west": { lat: 10.0807, lng: -2.5078 },
  "savannah": { lat: 9.104, lng: -1.847 },
  "oti": { lat: 8.1, lng: 0.3 },
  "ahafo": { lat: 6.9, lng: -2.5 },
  "bono": { lat: 7.9, lng: -2.3 },
  "bono east": { lat: 7.65, lng: -1.1 },
  "western north": { lat: 6.5, lng: -2.9 },
  "north east": { lat: 10.5, lng: -0.3 },
};

const GHANA_CENTER = { lat: 7.95, lng: -1.02 };

export function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getPseudoCoordinates(id: string, region?: string) {
  const base = region ? REGION_CENTROIDS[region.toLowerCase()] : undefined;
  const seed = hashString(`${id}-${region ?? ''}`);
  const jitterLat = ((seed % 1000) / 1000 - 0.5) * 0.6;
  const jitterLng = (((seed >> 10) % 1000) / 1000 - 0.5) * 0.8;
  const lat = (base?.lat ?? GHANA_CENTER.lat) + jitterLat;
  const lng = (base?.lng ?? GHANA_CENTER.lng) + jitterLng;
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
}

export function isInBounds(lat: number, lng: number, bounds?: MapBounds | null) {
  if (!bounds) return true;
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}
