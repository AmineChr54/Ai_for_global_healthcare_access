"""SQLite DB layer: init schema, upsert organizations, record provenance."""

import json
import sqlite3
from pathlib import Path
from uuid import uuid4

from .config import DATABASE_URL, SCHEMA_DIR
from .models import MergedOrganization, ScrapedRow


def _sqlite_path() -> Path | None:
    """Return path if DATABASE_URL is sqlite, else None."""
    url = (DATABASE_URL or "").strip()
    if url.startswith("sqlite:///"):
        return Path(url.replace("sqlite:///", ""))
    return None


def get_connection(db_url: str | None = None):
    """Return a connection. Uses SQLite if DATABASE_URL (or db_url) is sqlite:///..."""
    url = db_url or DATABASE_URL
    if (url or "").strip().startswith("sqlite:///"):
        path = Path(url.replace("sqlite:///", ""))
        path.parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(str(path))
    import psycopg
    conninfo = url or DATABASE_URL
    # Short timeout so we fail fast if Postgres is not running
    if "connect_timeout" not in (conninfo or ""):
        sep = "&" if "?" in (conninfo or "") else "?"
        conninfo = f"{conninfo}{sep}connect_timeout=3"
    return psycopg.connect(conninfo)


def init_db(conn, db_url: str | None = None) -> None:
    """Create tables from schema (SQLite only). Idempotent."""
    is_sqlite = isinstance(conn, sqlite3.Connection) or (db_url or "").strip().startswith("sqlite:///")
    if not is_sqlite:
        return
    schema_file = SCHEMA_DIR / "001_sqlite.sql"
    if not schema_file.exists():
        return
    sql = schema_file.read_text()
    # Use executescript so multi-statement schema runs correctly (avoids splitting on ";" inside CREATE)
    try:
        conn.executescript(sql)
    except sqlite3.OperationalError as e:
        if "already exists" not in str(e).lower():
            raise
    conn.commit()
    # Ensure processed_rows exists (e.g. if DB was created from older schema)
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='processed_rows'"
    )
    if cur.fetchone() is None:
        conn.execute(
            """CREATE TABLE processed_rows (
                id TEXT PRIMARY KEY,
                source_url TEXT NOT NULL,
                content_table_id TEXT,
                row_hash TEXT,
                organization_id TEXT REFERENCES organizations(id),
                processed_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (source_url, content_table_id)
            )"""
        )
        conn.commit()
    # Migration: add lat, lon, organization_group_id to organizations if missing
    cur = conn.execute("PRAGMA table_info(organizations)")
    existing_cols = {row[1] for row in cur.fetchall()}
    for col in ("lat", "lon", "organization_group_id"):
        if col not in existing_cols:
            dtype = "REAL" if col in ("lat", "lon") else "TEXT"
            conn.execute(f"ALTER TABLE organizations ADD COLUMN {col} {dtype}")
            conn.commit()
    for col in ("reliability_score", "reliability_explanation"):
        if col not in existing_cols:
            dtype = "REAL" if col == "reliability_score" else "TEXT"
            conn.execute(f"ALTER TABLE organizations ADD COLUMN {col} {dtype}")
            conn.commit()
    # Migration: add idp_status and field_confidences for healthsync-app IDP workflow
    for col in ("idp_status", "field_confidences"):
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE organizations ADD COLUMN {col} TEXT")
            conn.commit()
    # Ensure activity_logs table exists
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='activity_logs'"
    )
    if cur.fetchone() is None:
        conn.execute(
            """CREATE TABLE activity_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                region TEXT,
                organization_id TEXT REFERENCES organizations(id),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)")
        conn.commit()


def _json_list(val) -> str:
    if val is None or val == []:
        return "[]"
    return json.dumps(val if isinstance(val, list) else [])


def _str_or_none(val) -> str | None:
    if val is None or (isinstance(val, str) and not val.strip()):
        return None
    return str(val).strip()


def _reliability_score(val: float | None) -> float | None:
    """Clamp reliability_score to 0-10; return None if missing."""
    if val is None:
        return None
    try:
        x = float(val)
        return max(0.0, min(10.0, x))
    except (TypeError, ValueError):
        return None


def get_organization_by_mongo_db(conn, mongo_db: str) -> dict | None:
    """Return first organization that has a source with this mongo_db. SQLite."""
    cur = conn.execute(
        "SELECT o.id, o.canonical_name, o.organization_type, o.address_city, o.address_line1, o.address_country_code FROM organizations o JOIN organization_sources s ON s.organization_id = o.id WHERE s.mongo_db = ? LIMIT 1",
        (_str_or_none(mongo_db),),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "canonical_name": row[1], "organization_type": row[2], "address_city": row[3], "address_line1": row[4], "address_country_code": row[5]}


def get_organization_by_id(conn, org_id: str) -> dict | None:
    """Load one organization by id for agent candidates."""
    cur = conn.execute(
        "SELECT id, canonical_name, organization_type, address_city, address_line1, address_country_code FROM organizations WHERE id = ?",
        (org_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "canonical_name": row[1], "organization_type": row[2], "address_city": row[3], "address_line1": row[4], "address_country_code": row[5]}


def get_candidates(conn, org_ids: list[str]) -> list[dict]:
    """Load candidate orgs by ids for the merge agent."""
    if not org_ids:
        return []
    out = []
    for oid in org_ids:
        o = get_organization_by_id(conn, oid)
        if o:
            out.append(o)
    return out


def get_all_organizations_for_embedding(conn) -> list[dict]:
    """Return all organizations with fields needed to build identity text (for embedding-store bootstrap)."""
    cur = conn.execute(
        """SELECT id, canonical_name, address_city, address_line1, address_country, address_country_code
           FROM organizations"""
    )
    return [
        {
            "id": r[0],
            "canonical_name": r[1],
            "address_city": r[2],
            "address_line1": r[3],
            "address_country": r[4],
            "address_country_code": r[5],
        }
        for r in cur.fetchall()
    ]


def get_organizations_missing_geocode(conn) -> list[dict]:
    """Return orgs that have address text but no lat/lon (for geocode backfill)."""
    cur = conn.execute(
        """SELECT id, canonical_name, address_line1, address_line2, address_line3,
           address_city, address_state_or_region, address_zip_or_postcode, address_country, address_country_code
           FROM organizations
           WHERE (lat IS NULL OR lon IS NULL)
           AND (TRIM(COALESCE(address_line1,'') || COALESCE(address_city,'') || COALESCE(address_line2,'')) != '')"""
    )
    rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "canonical_name": r[1],
            "address_line1": r[2],
            "address_line2": r[3],
            "address_line3": r[4],
            "address_city": r[5],
            "address_state_or_region": r[6],
            "address_zip_or_postcode": r[7],
            "address_country": r[8],
            "address_country_code": r[9],
        }
        for r in rows
    ]


def get_organizations_missing_reliability(conn) -> list[str]:
    """Return list of organization ids that have reliability_score IS NULL."""
    cur = conn.execute(
        "SELECT id FROM organizations WHERE reliability_score IS NULL"
    )
    return [r[0] for r in cur.fetchall()]


def get_organization_for_reliability(conn, org_id: str) -> dict | None:
    """Load one organization with full summary for reliability LLM (name, type, address, description, facility_type_id, specialties, procedure, equipment, capability)."""
    cur = conn.execute(
        """SELECT id, canonical_name, organization_type, address_line1, address_line2, address_city,
           address_state_or_region, address_zip_or_postcode, address_country, address_country_code,
           description, facility_type_id, operator_type_id
           FROM organizations WHERE id = ?""",
        (org_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    org = {
        "id": row[0],
        "canonical_name": row[1],
        "organization_type": row[2],
        "address_line1": row[3],
        "address_line2": row[4],
        "address_city": row[5],
        "address_state_or_region": row[6],
        "address_zip_or_postcode": row[7],
        "address_country": row[8],
        "address_country_code": row[9],
        "description": row[10],
        "facility_type_id": row[11],
        "operator_type_id": row[12],
        "specialties": [],
        "procedure": [],
        "equipment": [],
        "capability": [],
    }
    cur = conn.execute(
        "SELECT specialty FROM organization_specialties WHERE organization_id = ?", (org_id,)
    )
    org["specialties"] = [r[0] for r in cur.fetchall()]
    cur = conn.execute(
        "SELECT fact_type, value FROM organization_facts WHERE organization_id = ?", (org_id,)
    )
    for fact_type, value in cur.fetchall():
        if fact_type in ("procedure", "equipment", "capability") and value:
            org[fact_type].append(value)
    return org


def update_reliability(conn, org_id: str, score: float | None, explanation: str | None) -> None:
    """Set reliability_score and reliability_explanation for an organization."""
    score = _reliability_score(score)
    expl = _str_or_none(explanation)
    if len(expl or "") > 500:
        expl = (expl or "")[:500]
    conn.execute(
        "UPDATE organizations SET reliability_score = ?, reliability_explanation = ?, updated_at = datetime('now') WHERE id = ?",
        (score, expl, org_id),
    )
    conn.commit()


# Column order for organizations (must match schema 001_sqlite); excludes created_at, updated_at (defaults).
_ORG_COLUMNS = [
    "id", "canonical_name", "organization_type", "phone_numbers", "official_phone", "email", "websites", "official_website",
    "year_established", "accepts_volunteers", "facebook_link", "twitter_link", "linkedin_link", "instagram_link", "logo",
    "address_line1", "address_line2", "address_line3", "address_city", "address_state_or_region", "address_zip_or_postcode", "address_country", "address_country_code",
    "lat", "lon", "organization_group_id",
    "facility_type_id", "operator_type_id", "description", "area", "number_doctors", "capacity",
    "countries", "mission_statement", "mission_statement_link", "organization_description",
    "reliability_score", "reliability_explanation",
]


def _merged_to_org_values(merged: MergedOrganization, org_id: str) -> tuple:
    """Return (id, ...) tuple in _ORG_COLUMNS order for INSERT/UPDATE."""
    av = 1 if merged.accepts_volunteers else (0 if merged.accepts_volunteers is False else None)
    return (
        org_id,
        merged.canonical_name,
        merged.organization_type,
        _json_list(merged.phone_numbers),
        _str_or_none(merged.official_phone),
        _str_or_none(merged.email),
        _json_list(merged.websites),
        _str_or_none(merged.official_website),
        merged.year_established,
        av,
        _str_or_none(merged.facebook_link),
        _str_or_none(merged.twitter_link),
        _str_or_none(merged.linkedin_link),
        _str_or_none(merged.instagram_link),
        _str_or_none(merged.logo),
        _str_or_none(merged.address_line1),
        _str_or_none(merged.address_line2),
        _str_or_none(merged.address_line3),
        _str_or_none(merged.address_city),
        _str_or_none(merged.address_state_or_region),
        _str_or_none(merged.address_zip_or_postcode),
        _str_or_none(merged.address_country),
        _str_or_none(merged.address_country_code),
        merged.lat,
        merged.lon,
        _str_or_none(merged.organization_group_id),
        _str_or_none(merged.facility_type_id),
        _str_or_none(merged.operator_type_id),
        _str_or_none(merged.description),
        merged.area,
        merged.number_doctors,
        merged.capacity,
        _json_list(merged.countries),
        _str_or_none(merged.mission_statement),
        _str_or_none(merged.mission_statement_link),
        _str_or_none(merged.organization_description),
        _reliability_score(merged.reliability_score),
        _str_or_none(merged.reliability_explanation),
    )


def upsert_organization(
    conn,
    merged: MergedOrganization,
    source_rows: list[ScrapedRow],
    existing_org_id: str | None,
) -> str:
    """Insert or update one organization and its sources/specialties/facts/affiliations. Returns organization id."""
    org_id = existing_org_id or str(uuid4())
    values = _merged_to_org_values(merged, org_id)
    assert len(values) == len(_ORG_COLUMNS), f"values len {len(values)} vs columns len {len(_ORG_COLUMNS)}"

    if existing_org_id:
        update_cols = [c for c in _ORG_COLUMNS if c != "id"]
        set_cols = ", ".join(c + "=?" for c in update_cols)
        set_vals = tuple(values[_ORG_COLUMNS.index(c)] for c in update_cols) + (org_id,)
        conn.execute(
            f"UPDATE organizations SET {set_cols}, updated_at=datetime('now') WHERE id=?",
            set_vals,
        )
    else:
        placeholders = ",".join(["?"] * len(_ORG_COLUMNS))
        cols = ",".join(_ORG_COLUMNS)
        conn.execute(
            f"INSERT INTO organizations ({cols}) VALUES ({placeholders})",
            values,
        )

    # Replace specialties, facts, affiliations for this org (simple replace for upsert)
    conn.execute("DELETE FROM organization_specialties WHERE organization_id = ?", (org_id,))
    for s in merged.specialties:
        if s:
            conn.execute("INSERT OR IGNORE INTO organization_specialties (organization_id, specialty) VALUES (?,?)", (org_id, s.strip()))
    conn.execute("DELETE FROM organization_facts WHERE organization_id = ?", (org_id,))
    for p in merged.procedure:
        if p:
            conn.execute("INSERT INTO organization_facts (id, organization_id, fact_type, value) VALUES (?,?,?,?)", (str(uuid4()), org_id, "procedure", p.strip()))
    for e in merged.equipment:
        if e:
            conn.execute("INSERT INTO organization_facts (id, organization_id, fact_type, value) VALUES (?,?,?,?)", (str(uuid4()), org_id, "equipment", e.strip()))
    for c in merged.capability:
        if c:
            conn.execute("INSERT INTO organization_facts (id, organization_id, fact_type, value) VALUES (?,?,?,?)", (str(uuid4()), org_id, "capability", c.strip()))
    conn.execute("DELETE FROM organization_affiliations WHERE organization_id = ?", (org_id,))
    for a in merged.affiliation_type_ids:
        if a:
            conn.execute("INSERT OR IGNORE INTO organization_affiliations (organization_id, affiliation) VALUES (?,?)", (org_id, a.strip()))

    for row in source_rows:
        src_id = str(uuid4())
        ct_id = str(row.content_table_id) if row.content_table_id else None
        conn.execute(
            """INSERT INTO organization_sources (id, organization_id, source_url, content_table_id, mongo_db, raw_unique_id)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(organization_id, source_url, content_table_id) DO UPDATE SET mongo_db=excluded.mongo_db, raw_unique_id=excluded.raw_unique_id""",
            (src_id, org_id, row.source_url, ct_id, _str_or_none(row.mongo_db), str(row.unique_id) if row.unique_id else None),
        )
    conn.commit()
    return org_id


def update_lat_lon(conn, org_id: str, lat: float, lon: float) -> None:
    """Update only lat/lon for an organization (e.g. after geocoding). SQLite (?) placeholders."""
    conn.execute(
        "UPDATE organizations SET lat=?, lon=?, updated_at=datetime('now') WHERE id=?",
        (lat, lon, org_id),
    )
    conn.commit()


def get_processed_organization_id(conn, source_url: str, content_table_id: str | None) -> str | None:
    """Return organization_id if this (source_url, content_table_id) was already processed; else None."""
    ct_id = content_table_id if content_table_id is not None else ""
    cur = conn.execute(
        "SELECT organization_id FROM processed_rows WHERE source_url = ? AND content_table_id = ? LIMIT 1",
        (source_url, ct_id),
    )
    row = cur.fetchone()
    return row[0] if row else None


def record_processed(conn, source_url: str, content_table_id: str | None, organization_id: str) -> None:
    """Mark a source row as processed for idempotency."""
    conn.execute(
        "INSERT OR REPLACE INTO processed_rows (id, source_url, content_table_id, organization_id, processed_at) VALUES (?,?,?,?,datetime('now'))",
        (str(uuid4()), source_url, content_table_id or "", organization_id),
    )
    conn.commit()
