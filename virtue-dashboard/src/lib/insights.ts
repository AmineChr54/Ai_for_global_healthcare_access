import type { FacilityWithDerived, Insight } from '@/types';
import { hashString } from '@/lib/map-data/geo';

const KEY_SPECIALTIES = ['dentistry', 'ophthalmology', 'pediatrics', 'obstetrics'];
const PROCEDURE_GAPS = [
  { region: 'Northern', procedure: 'cataract surgery' },
  { region: 'Savannah', procedure: 'emergency obstetrics' },
  { region: 'Upper East', procedure: 'dialysis' },
];

function parseList(value?: string) {
  if (!value) return [];
  return value
    .split(/,|;|\//)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function makeConfidence(seed: string) {
  const hash = hashString(seed);
  return 0.52 + (hash % 40) / 100;
}

export function generateRegionInsights(facilities: FacilityWithDerived[]): Insight[] {
  const byRegion = new Map<string, FacilityWithDerived[]>();
  facilities.forEach((facility) => {
    const region = facility.region || 'Unknown';
    const entry = byRegion.get(region) ?? [];
    entry.push(facility);
    byRegion.set(region, entry);
  });

  const insights: Insight[] = [];
  byRegion.forEach((items, region) => {
    const specialties = new Set(items.flatMap((facility) => parseList(facility.specialties)));
    const missing = KEY_SPECIALTIES.filter((keyword) => ![...specialties].some((item) => item.includes(keyword)));

    if (missing.length) {
      const focus = missing[0];
      insights.push({
        id: `region-${region}-${focus}`,
        scope: 'region',
        region,
        title: `${region} could benefit from added ${focus} coverage`,
        rationale: `Only ${items.length} facilities list specialties here, with limited ${focus} signals across nearby providers.`,
        nextStep: `Validate ${focus} capacity and recruit partner clinics for coverage expansion.`,
        confidence: makeConfidence(region + focus),
        relatedFacilityIds: items.slice(0, 3).map((facility) => facility.id),
      });
    }
  });

  PROCEDURE_GAPS.forEach((gap) => {
    const regionFacilities = byRegion.get(gap.region);
    if (!regionFacilities || regionFacilities.length === 0) return;
    insights.push({
      id: `region-${gap.region}-${gap.procedure}`,
      scope: 'region',
      region: gap.region,
      title: `High-population pocket lacks ${gap.procedure}`,
      rationale: `Mock population layers show limited ${gap.procedure} within 50km of ${gap.region} coverage zones.`,
      nextStep: `Prioritize a mobile outreach + referral network for ${gap.procedure}.`,
      confidence: makeConfidence(gap.region + gap.procedure),
      relatedFacilityIds: regionFacilities.slice(0, 3).map((facility) => facility.id),
    });
  });

  return insights.slice(0, 6);
}

export function generateFacilityInsights(facility: FacilityWithDerived): Insight[] {
  const insights: Insight[] = [];
  if (facility.flags.length) {
    insights.push({
      id: `facility-${facility.id}-verify`,
      scope: 'facility',
      region: facility.region,
      title: `Verify claims for ${facility.name}`,
      rationale: facility.flags.map((flag) => flag.message).join(' '),
      nextStep: 'Request on-site verification and equipment photos.',
      confidence: makeConfidence(facility.id + 'flags'),
      relatedFacilityIds: [facility.id],
    });
  }

  if (!facility.specialties || !facility.capabilities) {
    insights.push({
      id: `facility-${facility.id}-enrich`,
      scope: 'facility',
      region: facility.region,
      title: 'Enrich data for service coverage',
      rationale: 'Specialties or capabilities are missing or incomplete.',
      nextStep: 'Call the facility to confirm services and staffing levels.',
      confidence: makeConfidence(facility.id + 'data'),
      relatedFacilityIds: [facility.id],
    });
  }

  if (!insights.length) {
    insights.push({
      id: `facility-${facility.id}-opportunity`,
      scope: 'facility',
      region: facility.region,
      title: 'Opportunity to expand outreach',
      rationale: 'No critical anomalies detected but regional access is uneven.',
      nextStep: 'Explore adding outreach days to improve coverage in nearby districts.',
      confidence: makeConfidence(facility.id + 'opportunity'),
      relatedFacilityIds: [facility.id],
    });
  }

  return insights.slice(0, 3);
}
