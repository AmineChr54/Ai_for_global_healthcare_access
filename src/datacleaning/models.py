"""Pydantic models for scraped rows and merge output. Keeps ingest independent of data/prompts."""

from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ScrapedRow(BaseModel):
    """One row from the CSV (parsed and normalized)."""

    source_url: str
    name: str
    pk_unique_id: Optional[int] = None
    mongo_db: Optional[str] = None
    specialties: List[str] = Field(default_factory=list)
    procedure: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)
    capability: List[str] = Field(default_factory=list)
    organization_type: Literal["facility", "ngo"] = "facility"
    content_table_id: Optional[UUID] = None
    phone_numbers: List[str] = Field(default_factory=list)
    email: Optional[str] = None
    websites: List[str] = Field(default_factory=list)
    official_website: Optional[str] = None
    year_established: Optional[int] = None
    accepts_volunteers: Optional[bool] = None
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
    address_country: Optional[str] = None
    address_country_code: Optional[str] = None
    countries: List[str] = Field(default_factory=list)
    mission_statement: Optional[str] = None
    mission_statement_link: Optional[str] = None
    organization_description: Optional[str] = None
    facility_type_id: Optional[str] = None
    operator_type_id: Optional[str] = None
    affiliation_type_ids: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    area: Optional[int] = None
    number_doctors: Optional[int] = None
    capacity: Optional[int] = None
    unique_id: Optional[UUID] = None

    class Config:
        str_strip_whitespace = True


class MergedOrganization(BaseModel):
    """One canonical organization after merging one or more scraped rows. Maps to DB organizations table."""

    canonical_name: str
    organization_type: Literal["facility", "ngo"] = "facility"

    phone_numbers: List[str] = Field(default_factory=list)
    official_phone: Optional[str] = None
    email: Optional[str] = None
    websites: List[str] = Field(default_factory=list)
    official_website: Optional[str] = None
    year_established: Optional[int] = None
    accepts_volunteers: Optional[bool] = None
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
    address_country: Optional[str] = None
    address_country_code: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    organization_group_id: Optional[str] = None
    # Optional: agent-produced clean address line for geocoding (not stored in DB).
    geocode_query: Optional[str] = None

    facility_type_id: Optional[str] = None
    operator_type_id: Optional[str] = None
    description: Optional[str] = None
    area: Optional[int] = None
    number_doctors: Optional[int] = None
    capacity: Optional[int] = None

    countries: List[str] = Field(default_factory=list)
    mission_statement: Optional[str] = None
    mission_statement_link: Optional[str] = None
    organization_description: Optional[str] = None

    specialties: List[str] = Field(default_factory=list)
    procedure: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)
    capability: List[str] = Field(default_factory=list)
    affiliation_type_ids: List[str] = Field(default_factory=list)

    # Reliability analysis: 0-10 score + short explanation (data makes sense / what does not match).
    reliability_score: Optional[float] = None
    reliability_explanation: Optional[str] = None


class MergeDecision(BaseModel):
    """Agent output: one or more orgs (one per location when addresses differ)."""

    existing_organization_id: Optional[UUID] = Field(
        None,
        description="If merging into a single existing org (one location), its UUID. Null when creating new or multiple.",
    )
    merged_organizations: List[MergedOrganization] = Field(
        description="One merged record per distinct location. One entry when same location; multiple when same org but different decent addresses."
    )
    row_assignments: Optional[List[List[int]]] = Field(
        None,
        description="For each merged_organizations[i], list of input row indices (0-based) that belong to that location. If null, all rows go to merged_organizations[0].",
    )
