"""
CRUD REST API router for the healthsync-app frontend.

All endpoints connect to the same SQLite database (ghana_dataset/health.db)
used by the LLM query pipeline.  Mounted under /api by the main FastAPI app.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import sys
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

# Ensure project root on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Direct path to the SQLite database – avoids the fragile DATABASE_URL chain
# that can break when .env sets DATABASE_URL to an empty string.
DB_PATH = PROJECT_ROOT / "ghana_dataset" / "health.db"

from api.schemas import (
    ActivityLogCreate,
    ActivityLogResponse,
    AffiliationResponse,
    DashboardStatsResponse,
    FacilityViewResponse,
    FactResponse,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
    RegionCount,
    SourceResponse,
    SpecialtyResponse,
    TypeCount,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["crud"])


# ── helpers ──────────────────────────────────────────────────────────────────


def _get_conn() -> sqlite3.Connection:
    """Return a fresh SQLite connection with row_factory set."""
    if not DB_PATH.exists():
        raise RuntimeError(f"Database not found at {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _json_parse(val: str | None) -> list:
    """Parse a JSON-encoded list stored as TEXT in SQLite."""
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _json_dict_parse(val: str | None) -> dict | None:
    """Parse a JSON-encoded dict stored as TEXT in SQLite."""
    if not val:
        return None
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _bool_from_int(val) -> bool | None:
    if val is None:
        return None
    return bool(val)


def _row_to_org(row: sqlite3.Row) -> OrganizationResponse:
    """Convert a sqlite3.Row from the organizations table to the API response model."""
    d = dict(row)
    return OrganizationResponse(
        id=d["id"],
        canonical_name=d["canonical_name"],
        organization_type=d["organization_type"],
        phone_numbers=_json_parse(d.get("phone_numbers")),
        official_phone=d.get("official_phone"),
        email=d.get("email"),
        websites=_json_parse(d.get("websites")),
        official_website=d.get("official_website"),
        facebook_link=d.get("facebook_link"),
        twitter_link=d.get("twitter_link"),
        linkedin_link=d.get("linkedin_link"),
        instagram_link=d.get("instagram_link"),
        logo=d.get("logo"),
        address_line1=d.get("address_line1"),
        address_line2=d.get("address_line2"),
        address_line3=d.get("address_line3"),
        address_city=d.get("address_city"),
        address_state_or_region=d.get("address_state_or_region"),
        address_zip_or_postcode=d.get("address_zip_or_postcode"),
        address_country=d.get("address_country") or "Ghana",
        address_country_code=d.get("address_country_code") or "GH",
        lat=d.get("lat"),
        lon=d.get("lon"),
        organization_group_id=d.get("organization_group_id"),
        facility_type_id=d.get("facility_type_id"),
        operator_type_id=d.get("operator_type_id"),
        description=d.get("description"),
        area=d.get("area"),
        number_doctors=d.get("number_doctors"),
        capacity=d.get("capacity"),
        year_established=d.get("year_established"),
        countries=_json_parse(d.get("countries")),
        mission_statement=d.get("mission_statement"),
        mission_statement_link=d.get("mission_statement_link"),
        organization_description=d.get("organization_description"),
        accepts_volunteers=_bool_from_int(d.get("accepts_volunteers")),
        reliability_score=d.get("reliability_score"),
        reliability_explanation=d.get("reliability_explanation"),
        idp_status=d.get("idp_status"),
        field_confidences=_json_dict_parse(d.get("field_confidences")),
        created_at=d.get("created_at") or "",
        updated_at=d.get("updated_at") or "",
    )


# ── Organizations ────────────────────────────────────────────────────────────


@router.get("/organizations", response_model=List[OrganizationResponse])
def list_organizations(
    search: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    organizationType: Optional[str] = Query(None),
    facilityType: Optional[str] = Query(None),
    operatorType: Optional[str] = Query(None),
    idpStatus: Optional[str] = Query(None),
):
    """Return all organizations, optionally filtered by query params."""
    conn = _get_conn()
    try:
        clauses: list[str] = []
        params: list = []

        if search:
            clauses.append(
                "(canonical_name LIKE ? OR address_city LIKE ? OR address_state_or_region LIKE ? OR description LIKE ?)"
            )
            q = f"%{search}%"
            params.extend([q, q, q, q])

        if region and region != "all":
            clauses.append("address_state_or_region = ?")
            params.append(region)

        if organizationType and organizationType != "all":
            clauses.append("organization_type = ?")
            params.append(organizationType)

        if facilityType and facilityType != "all":
            clauses.append("facility_type_id = ?")
            params.append(facilityType)

        if operatorType and operatorType != "all":
            clauses.append("operator_type_id = ?")
            params.append(operatorType)

        if idpStatus and idpStatus != "all":
            clauses.append("idp_status = ?")
            params.append(idpStatus)

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM organizations{where} ORDER BY canonical_name"
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_org(r) for r in rows]
    finally:
        conn.close()


@router.get("/organizations/{org_id}", response_model=OrganizationResponse)
def get_organization(org_id: str):
    """Return a single organization by ID."""
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Organization not found")
        return _row_to_org(row)
    finally:
        conn.close()


@router.post("/organizations", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(body: OrganizationCreate):
    """Insert a new organization (and optional child rows)."""
    conn = _get_conn()
    try:
        org_id = str(uuid4())
        av = 1 if body.accepts_volunteers else (0 if body.accepts_volunteers is False else None)

        conn.execute(
            """INSERT INTO organizations (
                id, canonical_name, organization_type,
                phone_numbers, official_phone, email, websites, official_website,
                facebook_link, twitter_link, linkedin_link, instagram_link, logo,
                address_line1, address_line2, address_line3,
                address_city, address_state_or_region, address_zip_or_postcode,
                address_country, address_country_code,
                lat, lon, organization_group_id,
                facility_type_id, operator_type_id, description, area,
                number_doctors, capacity, year_established,
                countries, mission_statement, mission_statement_link, organization_description,
                accepts_volunteers,
                reliability_score, reliability_explanation,
                idp_status, field_confidences
            ) VALUES (
                ?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?, ?,?, ?,?
            )""",
            (
                org_id, body.canonical_name, body.organization_type,
                json.dumps(body.phone_numbers), body.official_phone, body.email,
                json.dumps(body.websites), body.official_website,
                body.facebook_link, body.twitter_link, body.linkedin_link,
                body.instagram_link, body.logo,
                body.address_line1, body.address_line2, body.address_line3,
                body.address_city, body.address_state_or_region, body.address_zip_or_postcode,
                body.address_country, body.address_country_code,
                body.lat, body.lon, body.organization_group_id,
                body.facility_type_id, body.operator_type_id, body.description, body.area,
                body.number_doctors, body.capacity, body.year_established,
                json.dumps(body.countries), body.mission_statement,
                body.mission_statement_link, body.organization_description,
                av,
                body.reliability_score, body.reliability_explanation,
                body.idp_status,
                json.dumps(body.field_confidences) if body.field_confidences else None,
            ),
        )

        # Child rows
        for s in body.specialties:
            if s:
                conn.execute(
                    "INSERT OR IGNORE INTO organization_specialties (organization_id, specialty) VALUES (?,?)",
                    (org_id, s.strip()),
                )
        for f in body.facts:
            if f.get("value"):
                conn.execute(
                    "INSERT INTO organization_facts (id, organization_id, fact_type, value) VALUES (?,?,?,?)",
                    (str(uuid4()), org_id, f.get("fact_type", "capability"), f["value"].strip()),
                )
        for a in body.affiliations:
            if a:
                conn.execute(
                    "INSERT OR IGNORE INTO organization_affiliations (organization_id, affiliation) VALUES (?,?)",
                    (org_id, a.strip()),
                )

        # Auto-create activity log
        conn.execute(
            "INSERT INTO activity_logs (id, user_id, user_name, action, details, region, organization_id) VALUES (?,?,?,?,?,?,?)",
            (str(uuid4()), "system", "System", "Added organization", body.canonical_name, body.address_state_or_region, org_id),
        )

        conn.commit()

        row = conn.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
        return _row_to_org(row)
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to create organization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/organizations/{org_id}", response_model=OrganizationResponse)
def update_organization(org_id: str, body: OrganizationUpdate):
    """Update an existing organization."""
    conn = _get_conn()
    try:
        existing = conn.execute("SELECT id FROM organizations WHERE id = ?", (org_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Organization not found")

        av = 1 if body.accepts_volunteers else (0 if body.accepts_volunteers is False else None)

        conn.execute(
            """UPDATE organizations SET
                canonical_name=?, organization_type=?,
                phone_numbers=?, official_phone=?, email=?, websites=?, official_website=?,
                facebook_link=?, twitter_link=?, linkedin_link=?, instagram_link=?, logo=?,
                address_line1=?, address_line2=?, address_line3=?,
                address_city=?, address_state_or_region=?, address_zip_or_postcode=?,
                address_country=?, address_country_code=?,
                lat=?, lon=?, organization_group_id=?,
                facility_type_id=?, operator_type_id=?, description=?, area=?,
                number_doctors=?, capacity=?, year_established=?,
                countries=?, mission_statement=?, mission_statement_link=?, organization_description=?,
                accepts_volunteers=?,
                reliability_score=?, reliability_explanation=?,
                idp_status=?, field_confidences=?,
                updated_at=datetime('now')
            WHERE id=?""",
            (
                body.canonical_name, body.organization_type,
                json.dumps(body.phone_numbers), body.official_phone, body.email,
                json.dumps(body.websites), body.official_website,
                body.facebook_link, body.twitter_link, body.linkedin_link,
                body.instagram_link, body.logo,
                body.address_line1, body.address_line2, body.address_line3,
                body.address_city, body.address_state_or_region, body.address_zip_or_postcode,
                body.address_country, body.address_country_code,
                body.lat, body.lon, body.organization_group_id,
                body.facility_type_id, body.operator_type_id, body.description, body.area,
                body.number_doctors, body.capacity, body.year_established,
                json.dumps(body.countries), body.mission_statement,
                body.mission_statement_link, body.organization_description,
                av,
                body.reliability_score, body.reliability_explanation,
                body.idp_status,
                json.dumps(body.field_confidences) if body.field_confidences else None,
                org_id,
            ),
        )

        # Replace child rows if provided
        if body.specialties:
            conn.execute("DELETE FROM organization_specialties WHERE organization_id = ?", (org_id,))
            for s in body.specialties:
                if s:
                    conn.execute(
                        "INSERT OR IGNORE INTO organization_specialties (organization_id, specialty) VALUES (?,?)",
                        (org_id, s.strip()),
                    )
        if body.facts:
            conn.execute("DELETE FROM organization_facts WHERE organization_id = ?", (org_id,))
            for f in body.facts:
                if f.get("value"):
                    conn.execute(
                        "INSERT INTO organization_facts (id, organization_id, fact_type, value) VALUES (?,?,?,?)",
                        (str(uuid4()), org_id, f.get("fact_type", "capability"), f["value"].strip()),
                    )
        if body.affiliations:
            conn.execute("DELETE FROM organization_affiliations WHERE organization_id = ?", (org_id,))
            for a in body.affiliations:
                if a:
                    conn.execute(
                        "INSERT OR IGNORE INTO organization_affiliations (organization_id, affiliation) VALUES (?,?)",
                        (org_id, a.strip()),
                    )

        # Auto-create activity log
        conn.execute(
            "INSERT INTO activity_logs (id, user_id, user_name, action, details, region, organization_id) VALUES (?,?,?,?,?,?,?)",
            (str(uuid4()), "system", "System", "Updated organization", body.canonical_name, body.address_state_or_region, org_id),
        )

        conn.commit()

        row = conn.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
        return _row_to_org(row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to update organization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── Child table endpoints ────────────────────────────────────────────────────


@router.get("/organizations/{org_id}/specialties", response_model=List[SpecialtyResponse])
def get_specialties(org_id: str):
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT organization_id, specialty FROM organization_specialties WHERE organization_id = ?",
            (org_id,),
        ).fetchall()
        return [SpecialtyResponse(organization_id=r["organization_id"], specialty=r["specialty"]) for r in rows]
    finally:
        conn.close()


@router.get("/organizations/{org_id}/facts", response_model=List[FactResponse])
def get_facts(org_id: str):
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, organization_id, fact_type, value, source_url FROM organization_facts WHERE organization_id = ?",
            (org_id,),
        ).fetchall()
        return [FactResponse(**dict(r)) for r in rows]
    finally:
        conn.close()


@router.get("/organizations/{org_id}/affiliations", response_model=List[AffiliationResponse])
def get_affiliations(org_id: str):
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT organization_id, affiliation FROM organization_affiliations WHERE organization_id = ?",
            (org_id,),
        ).fetchall()
        return [AffiliationResponse(**dict(r)) for r in rows]
    finally:
        conn.close()


@router.get("/organizations/{org_id}/sources", response_model=List[SourceResponse])
def get_sources(org_id: str):
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, organization_id, source_url, content_table_id, mongo_db, raw_unique_id, scraped_at FROM organization_sources WHERE organization_id = ?",
            (org_id,),
        ).fetchall()
        return [SourceResponse(**dict(r)) for r in rows]
    finally:
        conn.close()


@router.get("/organizations/{org_id}/facility-view", response_model=FacilityViewResponse)
def get_facility_view(org_id: str):
    """Return denormalized facility view row."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM facilities WHERE pk_unique_id = ?", (org_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Facility not found")
        d = dict(row)
        # Add fields not in the view
        org_row = conn.execute(
            "SELECT organization_type, reliability_score, idp_status FROM organizations WHERE id = ?",
            (org_id,),
        ).fetchone()
        return FacilityViewResponse(
            pk_unique_id=d["pk_unique_id"],
            name=d["name"],
            organization_type=dict(org_row)["organization_type"] if org_row else None,
            address_city=d.get("address_city"),
            address_stateOrRegion=d.get("address_stateOrRegion"),
            facilityTypeId=d.get("facilityTypeId"),
            operatorTypeId=d.get("operatorTypeId"),
            numberDoctors=d.get("numberDoctors"),
            capacity=d.get("capacity"),
            area=d.get("area"),
            yearEstablished=d.get("yearEstablished"),
            description=d.get("description"),
            officialWebsite=d.get("officialWebsite"),
            phone_numbers=d.get("phone_numbers"),
            websites=d.get("websites"),
            lat=d.get("lat"),
            lon=d.get("lon"),
            specialties=d.get("specialties"),
            procedure=d.get("procedure"),
            equipment=d.get("equipment"),
            capability=d.get("capability"),
            reliability_score=dict(org_row).get("reliability_score") if org_row else None,
            idp_status=dict(org_row).get("idp_status") if org_row else None,
        )
    finally:
        conn.close()


# ── Dashboard stats ──────────────────────────────────────────────────────────


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats():
    """Aggregated dashboard statistics."""
    conn = _get_conn()
    try:
        total = conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0]
        facilities = conn.execute("SELECT COUNT(*) FROM organizations WHERE organization_type='facility'").fetchone()[0]
        ngos = conn.execute("SELECT COUNT(*) FROM organizations WHERE organization_type='ngo'").fetchone()[0]
        pending = conn.execute(
            "SELECT COUNT(*) FROM organizations WHERE idp_status IN ('pending','flagged')"
        ).fetchone()[0]
        avg_row = conn.execute(
            "SELECT AVG(reliability_score) FROM organizations WHERE reliability_score IS NOT NULL"
        ).fetchone()
        avg_rel = round(avg_row[0], 1) if avg_row[0] else 0.0

        # By region
        region_rows = conn.execute(
            "SELECT COALESCE(address_state_or_region, 'Unknown') AS region, COUNT(*) AS cnt "
            "FROM organizations GROUP BY address_state_or_region ORDER BY cnt DESC"
        ).fetchall()
        by_region = [RegionCount(region=r["region"], count=r["cnt"]) for r in region_rows]

        # By facility type
        type_rows = conn.execute(
            "SELECT COALESCE(facility_type_id, 'other') AS ftype, COUNT(*) AS cnt "
            "FROM organizations WHERE organization_type='facility' "
            "GROUP BY facility_type_id ORDER BY cnt DESC"
        ).fetchall()
        by_type = [TypeCount(type=r["ftype"], count=r["cnt"]) for r in type_rows]

        # Recent activity
        log_rows = conn.execute(
            "SELECT id, user_id, user_name, action, details, region, created_at "
            "FROM activity_logs ORDER BY created_at DESC LIMIT 10"
        ).fetchall()
        recent = [
            ActivityLogResponse(
                id=r["id"],
                userId=r["user_id"],
                userName=r["user_name"],
                action=r["action"],
                details=r["details"],
                timestamp=r["created_at"],
                region=r["region"],
            )
            for r in log_rows
        ]

        return DashboardStatsResponse(
            totalOrganizations=total,
            totalFacilities=facilities,
            totalNGOs=ngos,
            pendingVerification=pending,
            avgReliability=avg_rel,
            byRegion=by_region,
            byType=by_type,
            recentActivity=recent,
        )
    finally:
        conn.close()


# ── Activity logs ────────────────────────────────────────────────────────────


@router.get("/activity-logs", response_model=List[ActivityLogResponse])
def list_activity_logs():
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, user_id, user_name, action, details, region, created_at "
            "FROM activity_logs ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
        return [
            ActivityLogResponse(
                id=r["id"],
                userId=r["user_id"],
                userName=r["user_name"],
                action=r["action"],
                details=r["details"],
                timestamp=r["created_at"],
                region=r["region"],
            )
            for r in rows
        ]
    finally:
        conn.close()


@router.post("/activity-logs", response_model=ActivityLogResponse, status_code=status.HTTP_201_CREATED)
def create_activity_log(body: ActivityLogCreate):
    conn = _get_conn()
    try:
        log_id = str(uuid4())
        conn.execute(
            "INSERT INTO activity_logs (id, user_id, user_name, action, details, region, organization_id) VALUES (?,?,?,?,?,?,?)",
            (log_id, body.userId, body.userName, body.action, body.details, body.region, body.organizationId),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, user_id, user_name, action, details, region, created_at FROM activity_logs WHERE id = ?",
            (log_id,),
        ).fetchone()
        return ActivityLogResponse(
            id=row["id"],
            userId=row["user_id"],
            userName=row["user_name"],
            action=row["action"],
            details=row["details"],
            timestamp=row["created_at"],
            region=row["region"],
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
