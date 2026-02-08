import Papa from 'papaparse';
import type { Facility } from '@/types';
import { randomId } from './utils';

export const REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
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

const textFields = ['capability', 'description', 'notes'];

function cleanString(value?: string | null) {
  if (value === null || value === undefined) return undefined;
  return String(value).replace(/^"|"$/g, '').trim() || undefined;
}

function parseArrayField(value?: string | null) {
  const raw = cleanString(value);
  if (!raw) return undefined;
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw.replace(/""/g, '"')) as string[];
      return parsed.filter(Boolean).join(', ');
    } catch (error) {
      return raw;
    }
  }
  return raw.split(/;|,\s*(?=[A-Z])/).map((item) => item.trim()).filter(Boolean).join(', ');
}

function toNumber(value?: string | null) {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function extractCoordinates(row: Record<string, string>): { lat?: number; lng?: number } {
  const lat = toNumber(row.latitude || row.lat || row.Latitude || row.Lat || row.geo_latitude);
  const lng = toNumber(row.longitude || row.lng || row.Longitude || row.Lon || row.geo_longitude);
  if (lat !== undefined && lng !== undefined) return { lat, lng };

  for (const key of textFields) {
    const block = row[key];
    if (!block) continue;
    const latMatch = block.match(/latitude\s*(-?\d+\.\d+)/i);
    const lngMatch = block.match(/longitude\s*(-?\d+\.\d+)/i);
    if (latMatch && lngMatch) {
      return { lat: Number(latMatch[1]), lng: Number(lngMatch[1]) };
    }
  }

  const region = cleanString(row.address_stateOrRegion || row.region || row.address_state || row.area);
  if (region) {
    const fallback = REGION_CENTROIDS[region.toLowerCase()];
    if (fallback) {
      const jitterLat = fallback.lat + (Math.random() - 0.5) * 0.4;
      const jitterLng = fallback.lng + (Math.random() - 0.5) * 0.4;
      return { lat: Number(jitterLat.toFixed(3)), lng: Number(jitterLng.toFixed(3)) };
    }
  }
  return {};
}

function mapRowToFacility(row: Record<string, string>, idx: number): Facility {
  const id =
    cleanString(row.unique_id) ||
    cleanString(row.pk_unique_id) ||
    cleanString(row.content_table_id) ||
    `facility-${idx + 1}`;
  const { lat, lng } = extractCoordinates(row);
  return {
    id,
    name: cleanString(row.name) || `Facility ${idx + 1}`,
    region: cleanString(row.address_stateOrRegion || row.region || row.address_state || 'Unknown') || 'Unknown',
    district: cleanString(row.address_city || row.area || row.address_line3),
    type: cleanString(row.facilityType || row.facilitytype || row.organization_type || row.facilityTypeId),
    operator: cleanString(row.operatorTypeId || row.operator || row.organization_type),
    latitude: lat,
    longitude: lng,
    specialties: parseArrayField(row.specialties),
    capabilities: parseArrayField(row.capability),
    equipment: parseArrayField(row.equipment),
    services: parseArrayField(row.procedure),
    contact: parseArrayField(row.phone_numbers) || cleanString(row.email),
    affiliations: parseArrayField(row.affiliationTypeIds),
    notes: cleanString(row.description || row.missionStatement || row.organizationDescription),
    lastUpdated: cleanString(row.lastUpdated || row.yearEstablished),
    confidence: toNumber(row.confidence) ?? Math.random() * 0.3 + 0.6,
    raw: row,
  };
}

function resolveCsvEndpoint(path: string) {
  if (path.startsWith('/mnt/data/')) {
    return `/api/csv?path=${encodeURIComponent(path)}`;
  }
  return path;
}

export async function fetchFacilitiesFromCsv(path: string): Promise<Facility[]> {
  try {
    const res = await fetch(resolveCsvEndpoint(path), { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load CSV: ${res.status}`);
    }
    const text = await res.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const facilities = parsed.data
      .filter((row) => Object.keys(row).length > 0)
      .map((row, idx) => mapRowToFacility(row, idx));
    return facilities;
  } catch (error) {
    console.warn('Falling back to mock facilities. Reason:', error);
    return fetchMockFacilities();
  }
}

export async function fetchMockFacilities(): Promise<Facility[]> {
  const res = await fetch('/data/mock-facilities.json');
  if (!res.ok) {
    return [
      {
        id: randomId('facility'),
        name: 'Sample Field Clinic',
        region: 'Greater Accra',
        district: 'Accra',
        type: 'Clinic',
        operator: 'NGO',
        latitude: 5.56,
        longitude: -0.21,
        specialties: 'Maternal Health, Community Outreach',
        capabilities: 'Basic Surgery, Mobile Outreach',
        equipment: 'Portable Ultrasound',
        services: 'Prenatal Screening',
        contact: '+233 555 123 123',
        affiliations: 'Virtue Foundation',
        notes: 'Mock facility loaded because CSV was unavailable.',
        confidence: 0.65,
      },
    ];
  }
  return (await res.json()) as Facility[];
}
