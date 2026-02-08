import type { FeatureCollection, Point } from 'geojson';
import type { FacilityWithDerived } from '@/types';
import { getPseudoCoordinates } from '../geo';
import type { FacilityPointProps } from '../get-map-layers';

export function adaptFacilitiesToPoints(facilities: FacilityWithDerived[]): FeatureCollection<Point, FacilityPointProps> {
  return {
    type: 'FeatureCollection',
    features: facilities.map((facility) => {
      const coords = facility.latitude && facility.longitude
        ? { lat: facility.latitude, lng: facility.longitude }
        : getPseudoCoordinates(facility.id, facility.region);

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        properties: {
          facilityId: facility.id,
          confidence: facility.confidence ?? 0.6,
          region: facility.region,
        },
      };
    }),
  };
}
