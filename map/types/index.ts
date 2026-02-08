/**
 * Shared TypeScript interfaces for the VF Healthcare Map frontend.
 *
 * All components import from here instead of page.tsx.
 */

export interface Facility {
  id: string;
  uid: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  region: string;
  type: string;
  operator: string;
  specialties: string[];
  procedures: string[];
  equipment: string[];
  capabilities: string[];
  doctors: number | null;
  beds: number | null;
  orgType: string;
  description: string;
  website: string;
  phone?: string;
  email?: string;
}

export interface Analysis {
  medicalDeserts: {
    city: string;
    lat: number;
    lon: number;
    nearestHospitalKm: number | null;
    population: number | null;
  }[];
  coverageGrid: {
    lat: number;
    lon: number;
    coverageIndex: number;
    facilityCount: number;
  }[];
  regionStats: Record<string, any>;
  specialtyDistribution: Record<
    string,
    { total: number; regions: Record<string, number> }
  >;
  regionPopulation: Record<string, number>;
  whoGuidelines: Record<string, number>;
  ghanaHealthStats: Record<string, any>;
}

export interface LayerState {
  showFacilities: boolean;
  showDeserts: boolean;
  showCoverage: boolean;
  showPopulation: boolean;
  showNgos: boolean;
  coverageRadius: number;
  populationThreshold: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: {
    intent?: string;
    agents?: string[];
    citations?: any[];
    elapsed?: number;
    facilityNames?: string[];
  };
}

export interface QueryFilters {
  specialty?: string;
  types?: string[];
}
