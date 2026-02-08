import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { FacilityWithDerived } from '@/types';
import { adaptFacilitiesToPoints } from './adapters/facility-points';
import { buildDesertPolygons } from './build-desert-polygons';

export type FacilityPointProps = {
  facilityId: string;
  confidence: number;
  region?: string;
};

export type MapLayerData = {
  facilityPoints: FeatureCollection<Point, FacilityPointProps>;
  heatPolygons: FeatureCollection<Polygon, { id: string; intensity: number }>;
};

export function getMapLayers(facilities: FacilityWithDerived[], selectedSpecialties: string[] = []): MapLayerData {
  const facilityPoints: FeatureCollection<Point, FacilityPointProps> = adaptFacilitiesToPoints(facilities);
  const heatPolygons = buildDesertPolygons(facilities, selectedSpecialties);

  return {
    facilityPoints,
    heatPolygons,
  };
}
