import { REGION_CENTROIDS } from '@/lib/data-loader';

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
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
