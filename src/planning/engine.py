"""
Planning Engine — volunteer deployment optimization with 1 LLM call.

Architecture:
    1. parse_plan_request()     — regex + expand_medical_terms   (0 LLM calls)
    2. get_planning_data()      — 3 hardcoded SQL queries        (0 LLM calls)
    3. score_facilities()       — weighted Python math            (0 LLM calls)
    4. compute_coverage_impact()— before/after metrics            (0 LLM calls)
    5. synthesize via LLM       — deployment brief                (1 LLM call)

Total: 1 LLM call.  Same response contract as run_query() in graph_lite.py.
"""

from __future__ import annotations

import json
import logging
import re
import time as _time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.data.ghana_context import (
    GHANA_HEALTH_STATS,
    REGION_POPULATION,
    WHO_GUIDELINES,
)
from src.llm import get_llm
from src.planning.prompts import PLAN_SYNTHESIS_PROMPT
from src.tools.geocoding import haversine_km
from src.tools.medical_hierarchy import expand_medical_terms
from src.tools.sql_executor import execute_sql

logger = logging.getLogger(__name__)

# Maximum region population (for normalizing population score)
_MAX_REGION_POP = max(REGION_POPULATION.values())


# ── Structured output schema (reuses shape from graph_lite) ──────────────────


class PlanCitation(BaseModel):
    facility_name: str = Field(default="", description="Facility name")
    evidence: str = Field(description="The specific data point cited")


class PlanSynthesisOutput(BaseModel):
    """LLM output: deployment brief + citations + facility names."""

    response: str = Field(description="Full formatted deployment brief in markdown")
    citations: List[PlanCitation] = Field(
        default_factory=list,
        description="Row-level citations for facilities mentioned",
    )
    facility_names: List[str] = Field(
        default_factory=list,
        description="All facility names mentioned (for map highlighting)",
    )


# ── Intent detection ─────────────────────────────────────────────────────────


_PLAN_KEYWORDS = [
    "plan", "deploy", "send", "place", "allocate",
    "assign", "optimize", "placement", "volunteer",
]

# Map person-form words to specialty names so expand_medical_terms can find them.
# Users say "send 5 cardiologists", not "send 5 cardiology".
_PERSON_TO_SPECIALTY: Dict[str, str] = {
    "cardiologist": "cardiology",
    "ophthalmologist": "ophthalmology",
    "pediatrician": "pediatrics",
    "neurologist": "neurology",
    "oncologist": "oncology",
    "psychiatrist": "psychiatry",
    "urologist": "urology",
    "dermatologist": "dermatology",
    "radiologist": "radiology",
    "pathologist": "pathology",
    "anesthesiologist": "anesthesiology",
    "orthopedist": "orthopedicSurgery",
    "surgeon": "generalSurgery",
    "dentist": "dentistry",
    "pharmacist": "pharmacy",
    "midwife": "gynecologyAndObstetrics",
    "gynecologist": "gynecologyAndObstetrics",
    "obstetrician": "gynecologyAndObstetrics",
    "endocrinologist": "endocrinologyAndDiabetesAndMetabolism",
    "gastroenterologist": "gastroenterology",
    "nephrologist": "nephrology",
    "pulmonologist": "pulmonology",
    "rheumatologist": "rheumatology",
    "hematologist": "hematology",
    "neonatologist": "neonatologyPerinatalMedicine",
}

_COUNT_PATTERN = re.compile(
    r"(\d+)\s*(?:volunteer|specialist|doctor|surgeon|nurse|"
    r"ophthalmolog\w*|cardiolog\w*|pediatric\w*|dentist\w*|"
    r"pharmacist\w*|midwi\w*|anesthesi\w*|orthop\w*|"
    r"neurolog\w*|oncolog\w*|psychiatri\w*|urolog\w*|"
    r"dermatolog\w*|radiolog\w*|patholog\w*|physician\w*)",
    re.IGNORECASE,
)


def parse_plan_request(question: str) -> Optional[Dict[str, Any]]:
    """
    Detect whether a question is a planning/deployment query.

    Returns {"volunteers": int, "specialty": str, "prefer_region": str | None}
    or None if the question is not a planning request.
    """
    q = question.lower()

    # Must contain at least one planning keyword
    if not any(kw in q for kw in _PLAN_KEYWORDS):
        return None

    # Extract volunteer count
    count_match = _COUNT_PATTERN.search(question)
    volunteers = int(count_match.group(1)) if count_match else 3  # sensible default

    # First try direct person-form mapping (highest priority).
    # e.g. "cardiologists" -> "cardiology"
    direct_specialty: Optional[str] = None
    for person_form, specialty_name in _PERSON_TO_SPECIALTY.items():
        if person_form in q or (person_form + "s") in q:
            direct_specialty = specialty_name
            break

    # Also run the medical hierarchy expander for additional terms
    expanded = expand_medical_terms(question)

    # Use the direct mapping if found, otherwise fall back to expander
    if direct_specialty:
        specialty = direct_specialty
        # Ensure the direct specialty is first in expanded_terms
        if direct_specialty not in expanded:
            expanded = [direct_specialty] + expanded
        else:
            expanded = [direct_specialty] + [t for t in expanded if t != direct_specialty]
    else:
        specialty = expanded[0] if expanded else "generalSurgery"

    # Extract optional region preference
    prefer_region: Optional[str] = None
    for region_name in REGION_POPULATION:
        if region_name.lower() in q:
            prefer_region = region_name
            break

    logger.info(
        f"[planning] Detected plan request: "
        f"volunteers={volunteers}, specialty={specialty}, region={prefer_region}"
    )
    return {
        "volunteers": volunteers,
        "specialty": specialty,
        "prefer_region": prefer_region,
        "expanded_terms": expanded,
    }


# ── Data retrieval (hardcoded SQL — 0 LLM calls) ────────────────────────────


def _multi_col_like(specialty: str) -> str:
    """Build a multi-column LIKE condition for a specialty term."""
    s = specialty.replace("'", "''")
    cols = ["specialties", "procedure", "capability", "equipment"]
    parts = [f"LOWER({c}) LIKE LOWER('%{s}%')" for c in cols]
    return "(" + " OR ".join(parts) + ")"


def get_planning_data(
    specialty: str, prefer_region: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run pre-built SQL queries to gather all data needed for scoring.
    Zero LLM calls.
    """
    spec_cond = _multi_col_like(specialty)
    region_filter = ""
    if prefer_region:
        safe_region = prefer_region.replace("'", "''")
        region_filter = f"AND LOWER(f.address_stateOrRegion) LIKE LOWER('%{safe_region}%')"

    # 1. Candidate facilities — hospitals/clinics with coordinates
    #    Joins organizations table to get accepts_volunteers
    candidates_sql = f"""
        SELECT DISTINCT
            f.name,
            f.address_city,
            f.address_stateOrRegion AS region,
            f.lat,
            f.lon,
            f.facilityTypeId,
            f.operatorTypeId,
            f.numberDoctors,
            f.capacity,
            o.accepts_volunteers,
            f.specialties,
            f.procedure,
            f.equipment,
            f.capability
        FROM facilities f
        JOIN organizations o ON f.pk_unique_id = o.id
        WHERE f.facilityTypeId IN ('hospital', 'clinic')
          AND f.lat IS NOT NULL AND f.lon IS NOT NULL
          AND f.organization_type = 'facility'
          {region_filter}
        ORDER BY f.address_stateOrRegion
        LIMIT 200
    """

    # 2. Existing coverage — count of facilities with this specialty per region
    coverage_sql = f"""
        SELECT address_stateOrRegion AS region,
               COUNT(DISTINCT pk_unique_id) AS count
        FROM facilities
        WHERE {spec_cond}
          AND organization_type = 'facility'
        GROUP BY address_stateOrRegion
        ORDER BY count ASC
    """

    # 3. Existing specialist locations — for distance calculations
    existing_sql = f"""
        SELECT DISTINCT name, address_city,
               address_stateOrRegion AS region, lat, lon
        FROM facilities
        WHERE {spec_cond}
          AND lat IS NOT NULL AND lon IS NOT NULL
          AND organization_type = 'facility'
    """

    candidates = execute_sql(candidates_sql)
    coverage = execute_sql(coverage_sql)
    existing = execute_sql(existing_sql)

    logger.info(
        f"[planning] Data retrieved: "
        f"{candidates['row_count']} candidates, "
        f"{coverage['row_count']} coverage rows, "
        f"{existing['row_count']} existing specialists"
    )
    return {
        "candidates": candidates,
        "coverage": coverage,
        "existing": existing,
    }


# ── Scoring algorithm (pure Python — 0 LLM calls) ───────────────────────────


def score_facilities(
    data: Dict[str, Any],
    specialty: str,
    num_volunteers: int,
) -> List[Dict[str, Any]]:
    """
    Rank candidate facilities by deployment impact.
    Returns a sorted list of scored facility dicts.
    """
    candidates = data["candidates"]
    coverage = data["coverage"]
    existing = data["existing"]

    # Build coverage lookup: region -> existing specialist count
    coverage_map: Dict[str, int] = {}
    for row in coverage.get("rows", []):
        region = row.get("region", "")
        coverage_map[region] = row.get("count", 0)

    # Build existing specialist coordinates for distance calc
    existing_coords: List[tuple] = []
    for row in existing.get("rows", []):
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
            existing_coords.append((lat, lon))
        except (KeyError, TypeError, ValueError):
            continue

    scored: List[Dict[str, Any]] = []

    for fac in candidates.get("rows", []):
        score = 0.0
        region = fac.get("region", "")
        pop = REGION_POPULATION.get(region, 500_000)
        existing_count = coverage_map.get(region, 0)

        # ── 1. Gap severity (40 pts) ────────────────────────────────────
        if existing_count == 0:
            score += 40  # Total desert — no specialist in region
            gap_label = "critical"
        elif existing_count <= 2:
            score += 30
            gap_label = "severe"
        elif existing_count <= 5:
            score += 15
            gap_label = "moderate"
        else:
            score += 5
            gap_label = "low"

        # ── 2. Population impact (25 pts) ────────────────────────────────
        score += min(25, (pop / _MAX_REGION_POP) * 25)

        # ── 3. Facility readiness (20 pts) ──────────────────────────────
        # accepts_volunteers field
        av = fac.get("accepts_volunteers")
        if str(av).strip().lower() in ("1", "true", "yes"):
            score += 8

        # Bed capacity
        try:
            cap = int(fac.get("capacity") or 0)
            if cap >= 20:
                score += 6
            elif cap >= 5:
                score += 3
        except (ValueError, TypeError):
            pass

        # Has related equipment / capability for the specialty
        spec_lower = specialty.lower()
        for field in ("equipment", "capability", "procedure", "specialties"):
            val = str(fac.get(field, "") or "").lower()
            if spec_lower in val:
                score += 6
                break

        # ── 4. Geographic isolation (15 pts) ─────────────────────────────
        min_dist = float("inf")
        fac_lat = fac.get("lat")
        fac_lon = fac.get("lon")
        if fac_lat is not None and fac_lon is not None:
            try:
                flat = float(fac_lat)
                flon = float(fac_lon)
                for ex_lat, ex_lon in existing_coords:
                    d = haversine_km(flat, flon, ex_lat, ex_lon)
                    if d < min_dist:
                        min_dist = d
            except (ValueError, TypeError):
                pass

        if min_dist > 100:
            score += 15
        elif min_dist > 50:
            score += 10
        elif min_dist > 25:
            score += 5

        scored.append({
            "name": fac.get("name", "Unknown"),
            "city": fac.get("address_city") or fac.get("city", ""),
            "region": region,
            "lat": fac_lat,
            "lon": fac_lon,
            "facility_type": fac.get("facilityTypeId", ""),
            "operator": fac.get("operatorTypeId", ""),
            "doctors": fac.get("numberDoctors"),
            "beds": fac.get("capacity"),
            "accepts_volunteers": str(av).strip().lower() in ("1", "true", "yes"),
            "specialties": fac.get("specialties", ""),
            "equipment": fac.get("equipment", ""),
            "capability": fac.get("capability", ""),
            "impact_score": round(min(100, score), 1),
            "gap_severity": gap_label,
            "existing_coverage": existing_count,
            "region_population": pop,
            "nearest_specialist_km": (
                round(min_dist, 1) if min_dist < float("inf") else None
            ),
        })

    # Sort by impact score descending
    scored.sort(key=lambda x: x["impact_score"], reverse=True)

    # Diversify: cap per-region to spread volunteers geographically
    max_per_region = max(2, num_volunteers // 3 + 1)
    selected: List[Dict[str, Any]] = []
    region_counts: Dict[str, int] = {}

    for fac in scored:
        r = fac.get("region", "unknown")
        if region_counts.get(r, 0) < max_per_region:
            selected.append(fac)
            region_counts[r] = region_counts.get(r, 0) + 1
        if len(selected) >= num_volunteers * 2:
            break

    return selected


# ── Coverage impact analysis (pure Python — 0 LLM calls) ────────────────────


def compute_coverage_impact(
    selected: List[Dict[str, Any]],
    coverage_data: Dict[str, Any],
    specialty: str,
    num_volunteers: int,
) -> Dict[str, Any]:
    """
    Compute before/after metrics for the deployment plan.
    """
    # Before: which regions already have this specialty
    coverage_map: Dict[str, int] = {}
    for row in coverage_data.get("rows", []):
        region = row.get("region", "")
        coverage_map[region] = row.get("count", 0)

    regions_before = set(r for r, c in coverage_map.items() if c > 0)
    total_regions = len(REGION_POPULATION)

    # After: add selected facility regions
    top_picks = selected[:num_volunteers]
    new_regions = set()
    pop_gaining_access = 0

    for fac in top_picks:
        r = fac.get("region", "")
        if r and r not in regions_before:
            new_regions.add(r)
            pop_gaining_access += REGION_POPULATION.get(r, 0)

    regions_after = regions_before | new_regions

    # Unserved regions (still not covered after deployment)
    all_region_names = set(REGION_POPULATION.keys())
    unserved_before = all_region_names - regions_before
    unserved_after = all_region_names - regions_after

    return {
        "regions_with_specialty_before": len(regions_before),
        "regions_with_specialty_after": len(regions_after),
        "total_regions": total_regions,
        "new_regions_covered": sorted(new_regions),
        "population_gaining_first_access": pop_gaining_access,
        "unserved_regions_before": sorted(unserved_before),
        "unserved_regions_after": sorted(unserved_after),
        "top_placements": [
            {
                "rank": i + 1,
                "name": f["name"],
                "city": f.get("city", ""),
                "region": f.get("region", ""),
                "impact_score": f["impact_score"],
                "gap_severity": f["gap_severity"],
                "nearest_specialist_km": f.get("nearest_specialist_km"),
            }
            for i, f in enumerate(top_picks)
        ],
    }


# ── LLM synthesis (1 call) ──────────────────────────────────────────────────


def _invoke_with_retry(structured_llm, messages, *, max_attempts: int = 5):
    """Invoke LLM with rate-limit retry (mirrors graph_lite._invoke_with_retry)."""
    for attempt in range(max_attempts):
        try:
            return structured_llm.invoke(messages)
        except Exception as e:
            err = str(e).lower()
            is_rate_limit = "429" in str(e) or "rate" in err
            if is_rate_limit and attempt < max_attempts - 1:
                wait = 25 + attempt * 15
                logger.warning(
                    f"Rate-limited (attempt {attempt + 1}/{max_attempts}). "
                    f"Waiting {wait}s..."
                )
                _time.sleep(wait)
            else:
                raise


def _synthesize_plan(
    question: str,
    specialty: str,
    num_volunteers: int,
    scored_facilities: List[Dict[str, Any]],
    impact: Dict[str, Any],
) -> PlanSynthesisOutput:
    """
    Single LLM call: generate a deployment brief from scored data.
    """
    region_pop_lines = "\n".join(
        f"- {r}: {p:,}" for r, p in REGION_POPULATION.items()
    )

    system = PLAN_SYNTHESIS_PROMPT.format(
        volunteers=num_volunteers,
        specialty=specialty,
        total_pop=GHANA_HEALTH_STATS.get("total_population", 30_832_019),
        docs_per_10k=GHANA_HEALTH_STATS.get("doctors_per_10k", 1.4),
        who_docs=WHO_GUIDELINES.get("doctors_per_10k", 10.0),
        beds_per_10k=GHANA_HEALTH_STATS.get("hospital_beds_per_10k", 6.0),
        who_beds=WHO_GUIDELINES.get("hospital_beds_per_10k", 18.0),
        region_pop=region_pop_lines,
    )

    # Build evidence payload
    evidence_sections = [
        f"User request: {question}",
        f"Specialty: {specialty}",
        f"Volunteers available: {num_volunteers}",
        f"\n## Ranked Facilities (by impact score)\n{json.dumps(scored_facilities[:15], indent=2, default=str)}",
        f"\n## Coverage Impact Analysis\n{json.dumps(impact, indent=2, default=str)}",
    ]
    evidence = "\n\n".join(evidence_sections)

    llm = get_llm(temperature=0.2)
    structured_llm = llm.with_structured_output(PlanSynthesisOutput)

    result: PlanSynthesisOutput = _invoke_with_retry(
        structured_llm,
        [
            {"role": "system", "content": system},
            {"role": "user", "content": evidence},
        ],
    )

    logger.info(
        f"[planning] Synthesis done | {len(result.response)} chars, "
        f"{len(result.citations)} citations, "
        f"{len(result.facility_names)} facility names"
    )
    return result


# ── Public entry point ───────────────────────────────────────────────────────


def run_plan_query(question: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute the planning pipeline.  Returns the same dict shape as
    graph_lite.run_query() so the API server needs zero changes.

    Pipeline:
        parse (already done) -> SQL data -> score -> impact -> 1 LLM call
    """
    specialty = params["specialty"]
    num_volunteers = params["volunteers"]
    prefer_region = params.get("prefer_region")
    expanded_terms = params.get("expanded_terms", [])

    logger.info(
        f"[planning] Running plan: {num_volunteers} x {specialty}"
        + (f" (prefer {prefer_region})" if prefer_region else "")
    )

    # ── Step 1: Gather data (0 LLM calls) ───────────────────────────────
    data = get_planning_data(specialty, prefer_region)

    # ── Step 2: Score & rank (0 LLM calls) ──────────────────────────────
    scored = score_facilities(data, specialty, num_volunteers)

    if not scored:
        # No candidates found — return a helpful message without LLM call
        return {
            "synthesis": (
                f"No candidate facilities found for **{specialty}** deployment. "
                f"The database has no hospitals or clinics with coordinates "
                f"{'in ' + prefer_region if prefer_region else 'in Ghana'} "
                f"that could host volunteers. Try broadening the region or specialty."
            ),
            "citations": [],
            "intent": "planning",
            "required_agents": ["planning_engine"],
            "iteration": 1,
            "expanded_terms": expanded_terms,
            "sql_results": None,
            "facility_names": [],
        }

    # ── Step 3: Compute before/after impact (0 LLM calls) ───────────────
    impact = compute_coverage_impact(
        scored, data["coverage"], specialty, num_volunteers
    )

    # ── Step 4: LLM synthesis (1 LLM call) ──────────────────────────────
    synthesis = _synthesize_plan(
        question=question,
        specialty=specialty,
        num_volunteers=num_volunteers,
        scored_facilities=scored,
        impact=impact,
    )

    # ── Build facility_names for map highlighting ────────────────────────
    facility_names = list(synthesis.facility_names)
    # Also include scored facility names as fallback
    for fac in scored[:num_volunteers]:
        name = fac.get("name", "")
        if name and name not in facility_names:
            facility_names.append(name)

    return {
        "synthesis": synthesis.response,
        "citations": [
            {
                "facility_name": c.facility_name,
                "data_source": "planning_engine",
                "evidence": c.evidence,
            }
            for c in synthesis.citations
        ],
        "intent": "planning",
        "required_agents": ["planning_engine"],
        "iteration": 1,
        "expanded_terms": expanded_terms,
        "sql_results": {
            "success": True,
            "primary": {
                "rows": [{"deployment_plan": f"{num_volunteers} {specialty} volunteers"}],
                "row_count": 1,
                "sql": "planning_engine (no SQL generation needed)",
            },
            "detail": {
                "rows": scored[:num_volunteers],
                "row_count": len(scored[:num_volunteers]),
                "sql": "facility scoring algorithm",
            },
            "distribution": {
                "rows": [
                    {"region": r, "count": c}
                    for r, c in sorted(
                        {
                            fac["region"]: fac["existing_coverage"]
                            for fac in scored
                        }.items()
                    )
                ],
                "row_count": 0,
                "sql": "coverage analysis",
            },
            "explanation": "Planning engine: scored facilities by gap severity, population, readiness, and isolation",
        },
        "facility_names": facility_names,
    }
