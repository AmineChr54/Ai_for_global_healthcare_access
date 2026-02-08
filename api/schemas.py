"""
API Request / Response Models — Pydantic schemas for the REST API.

Separated from server.py for clarity and reusability.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Query pipeline schemas ──────────────────────────────────────────────────


class QueryRequest(BaseModel):
    """Request model for natural language queries."""

    question: str = Field(
        ...,
        description="Natural language question about healthcare facilities",
        examples=["How many hospitals have cardiology?"],
    )


class MapFilters(BaseModel):
    """Map visualization filters extracted from query."""

    specialty: Optional[str] = Field(None, description="Medical specialty to filter by")
    types: List[str] = Field(default_factory=list, description="Facility types to show")


class QueryResponse(BaseModel):
    """Response model containing analysis results and metadata."""

    synthesis: str = Field(..., description="Natural language answer to the query")
    citations: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Source citations with evidence",
    )
    intent: str = Field(..., description="Classified query intent category")
    required_agents: List[str] = Field(
        default_factory=list,
        description="Agents used in the pipeline",
    )
    iteration: int = Field(..., description="Number of quality gate iterations")
    elapsed: float = Field(..., description="Processing time in seconds")
    sql_results: Optional[Dict[str, Any]] = Field(
        None,
        description="Structured query results",
    )
    expanded_terms: List[str] = Field(
        default_factory=list,
        description="Medical terms expanded from query",
    )
    filters: MapFilters = Field(..., description="Filters for map visualization")
    facility_names: List[str] = Field(
        default_factory=list,
        description="Facility names to highlight on map",
    )


# ── CRUD schemas (healthsync-app) ──────────────────────────────────────────


class OrganizationResponse(BaseModel):
    """Full organization record returned to the frontend."""

    id: str
    canonical_name: str
    organization_type: str

    phone_numbers: List[str] = Field(default_factory=list)
    official_phone: Optional[str] = None
    email: Optional[str] = None
    websites: List[str] = Field(default_factory=list)
    official_website: Optional[str] = None

    facebook_link: Optional[str] = None
    twitter_link: Optional[str] = None
    linkedin_link: Optional[str] = None
    instagram_link: Optional[str] = None
    logo: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    address_line3: Optional[str] = None
    address_city: Optional[str] = None
    address_state_or_region: Optional[str] = None
    address_zip_or_postcode: Optional[str] = None
    address_country: str = "Ghana"
    address_country_code: str = "GH"

    lat: Optional[float] = None
    lon: Optional[float] = None

    organization_group_id: Optional[str] = None
    facility_type_id: Optional[str] = None
    operator_type_id: Optional[str] = None

    description: Optional[str] = None
    area: Optional[int] = None
    number_doctors: Optional[int] = None
    capacity: Optional[int] = None
    year_established: Optional[int] = None

    countries: List[str] = Field(default_factory=list)
    mission_statement: Optional[str] = None
    mission_statement_link: Optional[str] = None
    organization_description: Optional[str] = None

    accepts_volunteers: Optional[bool] = None

    reliability_score: Optional[float] = None
    reliability_explanation: Optional[str] = None

    idp_status: Optional[str] = None
    field_confidences: Optional[Dict[str, Any]] = None

    created_at: str = ""
    updated_at: str = ""


class OrganizationCreate(BaseModel):
    """Body for POST /api/organizations."""

    canonical_name: str
    organization_type: str = "facility"

    phone_numbers: List[str] = Field(default_factory=list)
    official_phone: Optional[str] = None
    email: Optional[str] = None
    websites: List[str] = Field(default_factory=list)
    official_website: Optional[str] = None

    facebook_link: Optional[str] = None
    twitter_link: Optional[str] = None
    linkedin_link: Optional[str] = None
    instagram_link: Optional[str] = None
    logo: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    address_line3: Optional[str] = None
    address_city: Optional[str] = None
    address_state_or_region: Optional[str] = None
    address_zip_or_postcode: Optional[str] = None
    address_country: str = "Ghana"
    address_country_code: str = "GH"

    lat: Optional[float] = None
    lon: Optional[float] = None

    organization_group_id: Optional[str] = None
    facility_type_id: Optional[str] = None
    operator_type_id: Optional[str] = None

    description: Optional[str] = None
    area: Optional[int] = None
    number_doctors: Optional[int] = None
    capacity: Optional[int] = None
    year_established: Optional[int] = None

    countries: List[str] = Field(default_factory=list)
    mission_statement: Optional[str] = None
    mission_statement_link: Optional[str] = None
    organization_description: Optional[str] = None

    accepts_volunteers: Optional[bool] = None

    reliability_score: Optional[float] = None
    reliability_explanation: Optional[str] = None

    idp_status: Optional[str] = "pending"
    field_confidences: Optional[Dict[str, Any]] = None

    # Optional child data included in creation
    specialties: List[str] = Field(default_factory=list)
    facts: List[Dict[str, str]] = Field(default_factory=list)  # [{fact_type, value}]
    affiliations: List[str] = Field(default_factory=list)


class OrganizationUpdate(OrganizationCreate):
    """Body for PUT /api/organizations/:id.  Same shape as Create."""

    pass


class SpecialtyResponse(BaseModel):
    organization_id: str
    specialty: str


class FactResponse(BaseModel):
    id: str
    organization_id: str
    fact_type: str
    value: str
    source_url: Optional[str] = None


class AffiliationResponse(BaseModel):
    organization_id: str
    affiliation: str


class SourceResponse(BaseModel):
    id: str
    organization_id: str
    source_url: str
    content_table_id: Optional[str] = None
    mongo_db: Optional[str] = None
    raw_unique_id: Optional[str] = None
    scraped_at: Optional[str] = None


class FacilityViewResponse(BaseModel):
    pk_unique_id: str
    name: str
    organization_type: Optional[str] = None
    address_city: Optional[str] = None
    address_stateOrRegion: Optional[str] = None
    facilityTypeId: Optional[str] = None
    operatorTypeId: Optional[str] = None
    numberDoctors: Optional[int] = None
    capacity: Optional[int] = None
    area: Optional[int] = None
    yearEstablished: Optional[int] = None
    description: Optional[str] = None
    officialWebsite: Optional[str] = None
    phone_numbers: Optional[str] = None
    websites: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    specialties: Optional[str] = None
    procedure: Optional[str] = None
    equipment: Optional[str] = None
    capability: Optional[str] = None
    reliability_score: Optional[float] = None
    idp_status: Optional[str] = None


class RegionCount(BaseModel):
    region: str
    count: int


class TypeCount(BaseModel):
    type: str
    count: int


class ActivityLogResponse(BaseModel):
    id: str
    userId: str
    userName: str
    action: str
    details: Optional[str] = None
    timestamp: str
    region: Optional[str] = None


class ActivityLogCreate(BaseModel):
    userId: str
    userName: str
    action: str
    details: Optional[str] = None
    region: Optional[str] = None
    organizationId: Optional[str] = None


class DashboardStatsResponse(BaseModel):
    totalOrganizations: int
    totalFacilities: int
    totalNGOs: int
    pendingVerification: int
    avgReliability: float
    byRegion: List[RegionCount]
    byType: List[TypeCount]
    recentActivity: List[ActivityLogResponse]


# ── IDP (Intelligent Document Parsing) schemas ──────────────────────────────


class IDPTermMapping(BaseModel):
    """One mapping trace entry showing how a user term was mapped to specialties."""

    input_term: str = Field(description="The fragment from the user's input text")
    matched_key: str = Field(description="The TERM_TO_SPECIALTY key it matched")
    match_type: str = Field(description="How it was matched: exact | stem | fuzzy")
    confidence: float = Field(description="Match confidence 0.0–1.0")
    mapped_specialties: List[str] = Field(
        default_factory=list,
        description="Canonical specialty names this term resolved to",
    )


class IDPResponse(BaseModel):
    """Response from the IDP parse endpoint."""

    extracted_fields: Dict[str, Any] = Field(
        default_factory=dict,
        description="Structured organization fields extracted from text/images",
    )
    specialties: List[str] = Field(
        default_factory=list,
        description="Canonical medical specialties identified",
    )
    field_confidences: Dict[str, float] = Field(
        default_factory=dict,
        description="Per-field confidence scores (0.0–1.0)",
    )
    term_mappings: List[IDPTermMapping] = Field(
        default_factory=list,
        description="Trace showing how free-form text was mapped to medical taxonomy",
    )
    extracted_text_from_images: Optional[str] = Field(
        None,
        description="Raw text extracted from uploaded images (if any)",
    )
    llm_calls_used: int = Field(
        default=0,
        description="Number of LLM API calls consumed (0 for text-only, 1+ for images)",
    )
