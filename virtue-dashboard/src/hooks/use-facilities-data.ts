'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchFacilitiesFromCsv, fetchMockFacilities } from '@/lib/data-loader';
import type { Facility } from '@/types';

export type FacilityDataSource =
  | { type: 'csv'; path: string }
  | { type: 'mock' };

async function loadFacilities(source: FacilityDataSource): Promise<Facility[]> {
  if (source.type === 'mock') {
    return fetchMockFacilities();
  }
  return fetchFacilitiesFromCsv(source.path);
}

export function useFacilitiesData(source: FacilityDataSource) {
  return useQuery<Facility[], Error>({
    queryKey: ['facilities', source],
    queryFn: () => loadFacilities(source),
  });
}
