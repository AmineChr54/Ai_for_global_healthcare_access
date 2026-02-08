-- NGO / Health system normalized schema (PostgreSQL + pgvector)
-- Run with: psql $DATABASE_URL -f schema/001_initial.sql
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding dimension: 1536 for OpenAI text-embedding-3-small; 384 for many sentence-transformers.
-- If using a different model, alter column: ALTER TABLE organization_embeddings ALTER COLUMN embedding TYPE vector(N);
BEGIN;

-- One row per resolved real-world organization (facility or NGO).
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name TEXT NOT NULL,
    organization_type TEXT NOT NULL CHECK (organization_type IN ('facility', 'ngo')),

    -- Contact & web
    phone_numbers TEXT[],
    official_phone TEXT,
    email TEXT,
    websites TEXT[],
    official_website TEXT,
    year_established INT,
    accepts_volunteers BOOLEAN,
    facebook_link TEXT,
    twitter_link TEXT,
    linkedin_link TEXT,
    instagram_link TEXT,
    logo TEXT,

    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    address_line3 TEXT,
    address_city TEXT,
    address_state_or_region TEXT,
    address_zip_or_postcode TEXT,
    address_country TEXT,
    address_country_code TEXT,

    -- Facility-only (NULL for NGO)
    facility_type_id TEXT,
    operator_type_id TEXT,
    description TEXT,
    area INT,
    number_doctors INT,
    capacity INT,

    -- NGO-only (NULL for facility)
    countries TEXT[],
    mission_statement TEXT,
    mission_statement_link TEXT,
    organization_description TEXT,

    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    organization_group_id TEXT,

    reliability_score REAL,
    reliability_explanation TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provenance: one row per source row that contributed to an organization.
CREATE TABLE IF NOT EXISTS organization_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    content_table_id UUID,
    mongo_db TEXT,
    raw_unique_id UUID,
    scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, source_url, content_table_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_sources_org ON organization_sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_sources_mongo ON organization_sources(mongo_db) WHERE mongo_db IS NOT NULL;

-- M:N specialties (facility/ngo).
CREATE TABLE IF NOT EXISTS organization_specialties (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    specialty TEXT NOT NULL,
    PRIMARY KEY (organization_id, specialty)
);

CREATE INDEX IF NOT EXISTS idx_organization_specialties_org ON organization_specialties(organization_id);

-- Procedure / equipment / capability facts (tagged list).
CREATE TABLE IF NOT EXISTS organization_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    fact_type TEXT NOT NULL CHECK (fact_type IN ('procedure', 'equipment', 'capability')),
    value TEXT NOT NULL,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_facts_org ON organization_facts(organization_id);

-- Affiliations (faith-tradition, government, etc.).
CREATE TABLE IF NOT EXISTS organization_affiliations (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    affiliation TEXT NOT NULL,
    PRIMARY KEY (organization_id, affiliation)
);

CREATE INDEX IF NOT EXISTS idx_organization_affiliations_org ON organization_affiliations(organization_id);

-- Identity embeddings for duplicate detection (pgvector).
-- Install: CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS organization_embeddings (
    organization_id UUID NOT NULL PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    embedding vector(1536) NOT NULL,
    embedding_model TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: idempotency for batch re-runs (skip already-ingested source rows).
CREATE TABLE IF NOT EXISTS processed_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT NOT NULL,
    content_table_id UUID,
    row_hash TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_url, content_table_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_rows_hash ON processed_rows(row_hash) WHERE row_hash IS NOT NULL;

-- Geography / name lookups for API and Text2SQL
CREATE INDEX IF NOT EXISTS idx_organizations_city ON organizations(address_city) WHERE address_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_country ON organizations(address_country_code) WHERE address_country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);
CREATE INDEX IF NOT EXISTS idx_organizations_facility_type ON organizations(facility_type_id) WHERE facility_type_id IS NOT NULL;

-- View for agent Text2SQL: flattens organizations + specialties + facts into one row per org.
CREATE OR REPLACE VIEW facilities AS
SELECT
  o.id::TEXT AS pk_unique_id,
  o.id::TEXT AS unique_id,
  o.canonical_name AS name,
  o.organization_type,
  o.address_city,
  o.address_state_or_region AS address_stateOrRegion,
  o.facility_type_id AS facilityTypeId,
  o.operator_type_id AS operatorTypeId,
  o.number_doctors AS numberDoctors,
  o.capacity,
  o.area,
  o.year_established AS yearEstablished,
  o.description,
  o.official_website AS officialWebsite,
  array_to_string(o.phone_numbers, ',') AS phone_numbers,
  array_to_string(o.websites, ',') AS websites,
  o.lat,
  o.lon,
  (SELECT string_agg(s.specialty, ',' ORDER BY s.specialty) FROM organization_specialties s WHERE s.organization_id = o.id) AS specialties,
  (SELECT string_agg(f.value, ',' ORDER BY f.value) FROM organization_facts f WHERE f.organization_id = o.id AND f.fact_type = 'procedure') AS procedure,
  (SELECT string_agg(f.value, ',' ORDER BY f.value) FROM organization_facts f WHERE f.organization_id = o.id AND f.fact_type = 'equipment') AS equipment,
  (SELECT string_agg(f.value, ',' ORDER BY f.value) FROM organization_facts f WHERE f.organization_id = o.id AND f.fact_type = 'capability') AS capability
FROM organizations o;

COMMIT;
