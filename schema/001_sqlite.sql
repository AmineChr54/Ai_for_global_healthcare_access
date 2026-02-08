-- SQLite variant (no pgvector). Use with external vector store (LanceDB/FAISS) for organization_embeddings.
-- Run with: sqlite3 health.db < schema/001_sqlite.sql

BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    organization_type TEXT NOT NULL CHECK (organization_type IN ('facility', 'ngo')),

    phone_numbers TEXT,
    official_phone TEXT,
    email TEXT,
    websites TEXT,
    official_website TEXT,
    year_established INTEGER,
    accepts_volunteers INTEGER,
    facebook_link TEXT,
    twitter_link TEXT,
    linkedin_link TEXT,
    instagram_link TEXT,
    logo TEXT,

    address_line1 TEXT,
    address_line2 TEXT,
    address_line3 TEXT,
    address_city TEXT,
    address_state_or_region TEXT,
    address_zip_or_postcode TEXT,
    address_country TEXT,
    address_country_code TEXT,

    facility_type_id TEXT,
    operator_type_id TEXT,
    description TEXT,
    area INTEGER,
    number_doctors INTEGER,
    capacity INTEGER,

    countries TEXT,
    mission_statement TEXT,
    mission_statement_link TEXT,
    organization_description TEXT,

    lat REAL,
    lon REAL,
    organization_group_id TEXT,

    reliability_score REAL,
    reliability_explanation TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Store arrays as JSON text in SQLite for phone_numbers, websites, countries
CREATE TABLE IF NOT EXISTS organization_sources (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    content_table_id TEXT,
    mongo_db TEXT,
    raw_unique_id TEXT,
    scraped_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (organization_id, source_url, content_table_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_sources_org ON organization_sources(organization_id);

CREATE TABLE IF NOT EXISTS organization_specialties (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    specialty TEXT NOT NULL,
    PRIMARY KEY (organization_id, specialty)
);

CREATE TABLE IF NOT EXISTS organization_facts (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    fact_type TEXT NOT NULL CHECK (fact_type IN ('procedure', 'equipment', 'capability')),
    value TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_organization_facts_org ON organization_facts(organization_id);

CREATE TABLE IF NOT EXISTS organization_affiliations (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    affiliation TEXT NOT NULL,
    PRIMARY KEY (organization_id, affiliation)
);

-- No organization_embeddings in SQLite; use LanceDB/FAISS keyed by organization_id.

CREATE TABLE IF NOT EXISTS processed_rows (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    content_table_id TEXT,
    row_hash TEXT,
    organization_id TEXT REFERENCES organizations(id),
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source_url, content_table_id)
);

CREATE INDEX IF NOT EXISTS idx_organizations_city ON organizations(address_city);
CREATE INDEX IF NOT EXISTS idx_organizations_country ON organizations(address_country_code);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);
CREATE INDEX IF NOT EXISTS idx_organizations_group ON organizations(organization_group_id) WHERE organization_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_lat_lon ON organizations(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;

COMMIT;
