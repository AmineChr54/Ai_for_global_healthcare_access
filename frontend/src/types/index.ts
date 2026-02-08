export type Facility = {
  id: string;
  name: string;
  region: string;
  district?: string;
  type?: string;
  operator?: string;
  latitude?: number;
  longitude?: number;
  specialties?: string;
  capabilities?: string;
  equipment?: string;
  services?: string;
  contact?: string;
  affiliations?: string;
  notes?: string;
  lastUpdated?: string;
  confidence?: number;
  raw?: Record<string, string>;
};

export type AgentQueryMode = 'simple' | 'advanced';

export type AgentQueryFilters = {
  region?: string;
  type?: string;
  capabilityKeywords?: string[];
  anomalyOnly?: boolean;
  radiusKm?: number;
  center?: { lat: number; lng: number };
};

export type AgentQuery = {
  text: string;
  mode: AgentQueryMode;
  filters?: AgentQueryFilters;
};

export type Citation = {
  id: string;
  field: string;
  snippet: string;
  rowId: string;
  confidence: number;
};

export type AgentTraceStep = {
  stepName: string;
  inputRefs: string[];
  output: string;
  citations: Citation[];
};

export type AgentFacilityFlag = {
  type: 'missing-equipment' | 'incomplete-data' | 'claim-mismatch' | 'confidence-low';
  message: string;
};

export type AgentResult = {
  facilities: FacilityWithDerived[];
  summary: string;
  metrics: Array<{ label: string; value: string; tone?: 'neutral' | 'warning' | 'success' }>;
  citations: Citation[];
  trace: AgentTraceStep[];
  createdAt: string;
};

export type FacilityWithDerived = Facility & {
  flags: AgentFacilityFlag[];
  highlightFields: string[];
};

export type PlanItem = {
  id: string;
  title: string;
  region: string;
  facilityId?: string;
  priority: 'High' | 'Medium' | 'Low';
  rationale: string;
  nextStep: string;
  owner?: string;
  dueDate?: string;
  status: 'todo' | 'in-progress' | 'done';
};

export type Insight = {
  id: string;
  scope: 'region' | 'facility';
  title: string;
  rationale: string;
  nextStep: string;
  confidence: number;
  relatedFacilityIds: string[];
  region?: string;
};
