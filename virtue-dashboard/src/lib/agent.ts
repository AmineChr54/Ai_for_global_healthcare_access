import type {
  AgentQuery,
  AgentResult,
  Facility,
  FacilityWithDerived,
  Citation,
  AgentTraceStep,
} from '@/types';
import { formatConfidence, randomId } from './utils';

const KEYWORD_FIELDS: Array<keyof Facility> = ['name', 'region', 'specialties', 'capabilities', 'equipment', 'services', 'notes'];
const ANOMALY_KEYWORDS = ['icu', 'oxygen', 'surgery', 'cataract', 'ophthalmology'];

function normalize(text?: string) {
  return text?.toLowerCase() ?? '';
}

function deriveFlags(facility: Facility): { flags: FacilityWithDerived['flags']; highlightFields: string[] } {
  const flags: FacilityWithDerived['flags'] = [];
  const highlightFields: string[] = [];
  const capabilityText = normalize(facility.capabilities);
  const equipmentText = normalize(facility.equipment);

  if (capabilityText.includes('icu') && !equipmentText.includes('oxygen')) {
    flags.push({
      type: 'claim-mismatch',
      message: 'Claims ICU services but lacks oxygen references.',
    });
  }

  if (capabilityText.includes('surgery') && !equipmentText.includes('sterile')) {
    flags.push({ type: 'missing-equipment', message: 'Surgical claims without supporting theatre equipment.' });
  }

  if (!facility.confidence || facility.confidence < 0.55) {
    flags.push({ type: 'confidence-low', message: 'Reported data confidence below 55%.' });
  }

  ANOMALY_KEYWORDS.forEach((keyword) => {
    for (const field of KEYWORD_FIELDS) {
      if (normalize(String(facility[field])).includes(keyword)) {
        highlightFields.push(field);
        break;
      }
    }
  });

  return { flags, highlightFields };
}

function filterByQuery(facility: FacilityWithDerived, query: AgentQuery): boolean {
  const tokens = query.text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);

  const combined = KEYWORD_FIELDS.map((field) => normalize(String(facility[field]))).join(' ');
  const tokenMatch = tokens.length === 0 || tokens.every((token) => combined.includes(token));

  const { filters } = query;
  const regionMatch = filters?.region ? normalize(facility.region).includes(filters.region.toLowerCase()) : true;
  const typeMatch = filters?.type ? normalize(facility.type).includes(filters.type.toLowerCase()) : true;
  const capabilityMatch = filters?.capabilityKeywords?.length
    ? filters.capabilityKeywords.every((keyword) => normalize(facility.capabilities).includes(keyword.toLowerCase()))
    : true;
  const anomalyMatch = filters?.anomalyOnly ? facility.flags.length > 0 : true;

  return tokenMatch && regionMatch && typeMatch && capabilityMatch && anomalyMatch;
}

function buildCitations(facilities: FacilityWithDerived[]): Citation[] {
  const citations: Citation[] = [];
  facilities.slice(0, 6).forEach((facility) => {
    ['specialties', 'capabilities', 'equipment'].forEach((field) => {
      const snippet = facility[field as keyof Facility];
      if (!snippet) return;
      citations.push({
        id: randomId('cit'),
        field,
        snippet: String(snippet).slice(0, 140),
        rowId: facility.id,
        confidence: facility.confidence ?? 0.6,
      });
    });
  });
  return citations;
}

function buildTrace(all: Facility[], filtered: FacilityWithDerived[]): AgentTraceStep[] {
  return [
    {
      stepName: 'Ingest & Normalize',
      inputRefs: ['Virtue Foundation Ghana v0.3'],
      output: `Loaded ${all.length} facilities and harmonized taxonomy fields.`,
      citations: [],
    },
    {
      stepName: 'Capability Matching',
      inputRefs: ['AgentQuery.text', 'dataset.capabilities'],
      output: `Applied keyword + filter match, returning ${filtered.length} relevant facilities.`,
      citations: filtered.slice(0, 2).flatMap((facility) =>
        ['capabilities', 'specialties'].map((field) => ({
          id: randomId('trace-cit'),
          field,
          snippet: String(facility[field as keyof Facility] ?? '').slice(0, 120),
          rowId: facility.id,
          confidence: facility.confidence ?? 0.6,
        }))
      ),
    },
    {
      stepName: 'Risk Scoring',
      inputRefs: ['equipment', 'claims'],
      output: 'Flagged potential claim mismatches where high acuity services lacked oxygen/theatre references.',
      citations: filtered
        .filter((facility) => facility.flags.length > 0)
        .slice(0, 3)
        .map((facility) => ({
          id: randomId('risk-cit'),
          field: 'flags',
          snippet: facility.flags.map((flag) => flag.message).join('; '),
          rowId: facility.id,
          confidence: 0.7,
        })),
    },
  ];
}

export function runAgent(query: AgentQuery, facilities: Facility[]): AgentResult {
  const derivedFacilities: FacilityWithDerived[] = facilities.map((facility) => {
    const analysis = deriveFlags(facility);
    return { ...facility, ...analysis };
  });

  const filtered = derivedFacilities.filter((facility) => filterByQuery(facility, query));
  const citations = buildCitations(filtered);
  const regions = new Set(filtered.map((facility) => facility.region).filter(Boolean));
  const anomalyCount = filtered.reduce((sum, facility) => sum + facility.flags.length, 0);
  const avgConfidence =
    filtered.reduce((acc, facility) => acc + (facility.confidence ?? 0.5), 0) / (filtered.length || 1);

  const summary = filtered.length
    ? `Identified ${filtered.length} facilities with signals matching "${query.text}" across ${regions.size} regions. ${
        anomalyCount > 0
          ? `${anomalyCount} anomaly signals need review (oxygen, ICU readiness, or data freshness).`
          : 'No major anomalies detected but continue monitoring readiness markers.'
      }`
    : 'No facilities matched that question. Adjust filters or load the sample data to explore patterns.';

  const metrics = [
    { label: 'Facilities Found', value: String(filtered.length || 0), tone: filtered.length ? 'success' : 'warning' },
    { label: 'Regions Impacted', value: String(regions.size || 0) },
    { label: 'Median Confidence', value: formatConfidence(avgConfidence) },
    { label: 'Anomalies Flagged', value: String(anomalyCount), tone: anomalyCount ? 'warning' : 'neutral' },
  ];

  return {
    facilities: filtered,
    summary,
    metrics,
    citations,
    trace: buildTrace(facilities, filtered),
    createdAt: new Date().toISOString(),
  };
}
