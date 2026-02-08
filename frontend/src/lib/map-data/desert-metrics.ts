import type { FacilityWithDerived } from '@/types';

function contains(value: string | undefined, token: string) {
  if (!value) return false;
  return value.toLowerCase().includes(token);
}

export function facilityCoverageScore(facility: FacilityWithDerived) {
  let score = 0;
  if (contains(facility.equipment, 'oxygen') || contains(facility.capabilities, 'oxygen')) score += 2.5;
  if (contains(facility.capabilities, 'icu')) score += 2;
  if (contains(facility.capabilities, 'surgery') || contains(facility.services, 'surgery')) score += 1.5;
  if (contains(facility.specialties, 'obstetrics')) score += 1;
  if (contains(facility.specialties, 'pediatrics')) score += 1;
  if (facility.flags?.length) score -= 0.5;
  return Math.max(0, score);
}

export function normalizeScore(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}
