"""Merge / same-or-new agent: one or more locations per org; address quality and multi-location handling."""

import json
import os
from typing import Any

from openai import OpenAI

from .config import LLM_MODEL, OPENAI_API_KEY
from .models import MergeDecision, MergedOrganization, ScrapedRow


def _row_to_summary(row: ScrapedRow, index: int) -> dict[str, Any]:
    """Summarize a scraped row for the prompt (include index for row_assignments)."""
    return {
        "row_index": index,
        "name": row.name,
        "organization_type": row.organization_type,
        "address": {
            "line1": row.address_line1,
            "line2": row.address_line2,
            "city": row.address_city,
            "region": row.address_state_or_region,
            "postcode": row.address_zip_or_postcode,
            "country": row.address_country or row.address_country_code,
            "country_code": row.address_country_code,
        },
        "phone_numbers": row.phone_numbers[:5],
        "email": row.email,
        "websites": row.websites[:3],
        "official_website": row.official_website,
        "description": (row.description or "")[:500],
        "specialties": row.specialties,
        "facility_type_id": row.facility_type_id,
        "operator_type_id": row.operator_type_id,
        "source_url": row.source_url,
    }


def _normalize_merged_dict(d: dict) -> None:
    if "canonical_name" not in d and "name" in d:
        d["canonical_name"] = d.pop("name")


def _merge_rows_with_agent(rows: list[ScrapedRow], candidates: list[dict], current_org: dict | None) -> MergeDecision:
    """Call LLM: one org per location when addresses differ; pick best address when one is bad."""
    api_key = OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key) if api_key else OpenAI()
    rows_json = json.dumps([_row_to_summary(r, i) for i, r in enumerate(rows)], indent=2)
    candidates_json = json.dumps(candidates, indent=2) if candidates else "None"
    current_json = json.dumps(current_org, indent=2) if current_org else "None"

    system = """You are a data steward for a health facility/NGO database. You receive one or more scraped rows that may be the same organization at one or more locations.

**When to treat as ONE location (output one merged record):**
- Same street / same key address (e.g. same address_line1 or same landmark) and the only difference is city vs neighborhood/area name. Example: "Opp. Standard Chartered Bank, Dansoman" and "Opp. Standard Chartered Bank, Accra" are the SAME place (Dansoman is a part of Accra). Merge into one record; use the more complete address (e.g. include both area and city: "Dansoman, Accra").
- One address is clearly bad/incomplete (vague, placeholder, wrong): pick the good one and output one record.
- Rows clearly refer to the same physical place (same street, same building, or same landmark).

**When to treat as MULTIPLE locations (output multiple merged_organizations):**
- Clearly different streets or different areas that are not the same place (e.g. different street names, or different cities/regions that are not neighborhood-of-city).
- Only then use "merged_organizations" with 2+ entries, same "canonical_name", same "organization_group_id", and "row_assignments" splitting rows by location.

**Address format:**
- Keep address in structured fields: address_line1, address_line2, address_city, address_state_or_region, address_zip_or_postcode, address_country, address_country_code. Prefer the most complete form (e.g. address_city can be "Dansoman, Accra" or use address_line2 for neighborhood and address_city for city).
- Include "lat" and "lon" only when you have clear coordinates in the source; otherwise omit or null.
- "organization_group_id": set only when you output multiple locations; leave null when single location.
- **geocode_query** (optional but recommended): For each merged_organizations entry, set a single-line address string optimized for map search. Format: "street or landmark, area or neighbourhood, city, Ghana". Expand abbreviations (e.g. "Opp." → "Opposite", "St" → "Street"), remove extra punctuation and vague text, and always end with ", Ghana". This is used to look up coordinates. Example: "Opposite Standard Chartered Bank, Dansoman, Accra, Ghana".

**Append / match to existing:**
- You are given "Possible duplicate candidates" (existing organizations from the DB, each with an "id"). If the new row(s) describe the SAME organization as one of these candidates (same or very similar name and address), you MUST set "existing_organization_id" to that candidate's exact "id" and output one merged_organizations entry that merges any new info from the row(s) into that existing record. Do not create a new organization when a candidate clearly matches.
- "existing_organization_id": UUID or null. Set to the matching candidate's "id" when the row(s) refer to that existing org; otherwise null (new org or multiple locations).

**Reliability (per merged_organizations entry):**
- For each merged organization, assess whether the reported data is internally consistent and medically/sensibly coherent (e.g. facility type vs specialties, procedures vs equipment, address vs country). Output:
  - "reliability_score": number 0-10 (0 = data contradicts or does not make sense, 10 = fully consistent and plausible).
  - "reliability_explanation": 1-2 sentences on what does not match or what is inconsistent; if everything is consistent, briefly say so (e.g. "Reported facility type, specialties and procedures are consistent.").

**Output format (JSON):**
- "merged_organizations": array of objects. Each object has: canonical_name, organization_type, address_line1, address_line2, address_city, address_state_or_region, address_zip_or_postcode, address_country, address_country_code, geocode_query (optional), lat (optional), lon (optional), organization_group_id (optional), plus phone_numbers, email, websites, official_website, description, facility_type_id, operator_type_id, specialties (array), procedure, equipment, capability, affiliation_type_ids, reliability_score (0-10), reliability_explanation (1-2 sentences), and other scalar fields. Use snake_case.
- "row_assignments": array of arrays. row_assignments[i] = list of row_index (0-based) that belong to merged_organizations[i]. Must cover every row index 0..n-1 exactly once when you have multiple locations. When single location, use [[0,1,...]] (all indices in one list).

**Single location example:** One merged_organizations entry, row_assignments = [[0, 1, 2]].
**Multi-location example:** Two addresses → two merged_organizations, row_assignments = [[0], [1]] or [[0, 2], [1]] etc."""

    user = f"""Input: {len(rows)} scraped row(s) (may be same org, one or multiple locations). Row indices 0 to {len(rows)-1}.

Rows (with row_index):
{rows_json}

Existing organization in DB (if we already have one for this pk/mongo):
{current_json}

Possible duplicate candidates:
{candidates_json}

Decide: (1) If the row(s) match one of the Possible duplicate candidates, set existing_organization_id to that candidate's "id" and output one merged_organizations entry (merge new info into existing). (2) Otherwise one or multiple locations as above. Output existing_organization_id, merged_organizations, and row_assignments."""

    resp = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0,
    )
    raw = resp.choices[0].message.content
    if not raw:
        raise RuntimeError("LLM did not return content")
    data = json.loads(raw)
    # Backward compat: single "merged" → merged_organizations + row_assignments
    if "merged_organizations" not in data and "merged" in data:
        data["merged_organizations"] = [data["merged"]]
        data["row_assignments"] = [list(range(len(rows)))]
    _LIST_FIELDS = ("phone_numbers", "websites", "countries", "specialties", "procedure", "equipment", "capability", "affiliation_type_ids")
    for m in data.get("merged_organizations", []):
        _normalize_merged_dict(m)
        for f in _LIST_FIELDS:
            if m.get(f) is None:
                m[f] = []
        # Normalize reliability: clamp score 0-10, ensure explanation is string or None
        if "reliability_score" in m and m["reliability_score"] is not None:
            try:
                s = float(m["reliability_score"])
                m["reliability_score"] = max(0.0, min(10.0, s))
            except (TypeError, ValueError):
                m["reliability_score"] = None
        if m.get("reliability_explanation") is not None and not isinstance(m["reliability_explanation"], str):
            m["reliability_explanation"] = str(m["reliability_explanation"])[:500] if m["reliability_explanation"] else None
        elif isinstance(m.get("reliability_explanation"), str) and len(m["reliability_explanation"]) > 500:
            m["reliability_explanation"] = m["reliability_explanation"][:500]
    out = MergeDecision.model_validate(data)
    if not out.merged_organizations:
        out.merged_organizations = [MergedOrganization(canonical_name=rows[0].name, organization_type=rows[0].organization_type)]
        out.row_assignments = [list(range(len(rows)))]
    # Default row_assignments if missing: all rows to first org
    if not out.row_assignments or len(out.row_assignments) != len(out.merged_organizations):
        out.row_assignments = [list(range(len(rows)))]
    # Enrich each merged org with list fields from its assigned rows
    for i, merged in enumerate(out.merged_organizations):
        indices = out.row_assignments[i] if i < len(out.row_assignments) else []
        assigned = [rows[j] for j in indices if 0 <= j < len(rows)]
        merged.specialties = list(set(s for r in assigned for s in (r.specialties or []))) or merged.specialties
        merged.procedure = list(dict.fromkeys(p for r in assigned for p in (r.procedure or []))) or merged.procedure
        merged.equipment = list(dict.fromkeys(e for r in assigned for e in (r.equipment or []))) or merged.equipment
        merged.capability = list(dict.fromkeys(c for r in assigned for c in (r.capability or []))) or merged.capability
        merged.phone_numbers = list(dict.fromkeys(p for r in assigned for p in (r.phone_numbers or []))) or merged.phone_numbers
        merged.websites = list(dict.fromkeys(w for r in assigned for w in (r.websites or []))) or merged.websites
        merged.affiliation_type_ids = list(dict.fromkeys(a for r in assigned for a in (r.affiliation_type_ids or []))) or merged.affiliation_type_ids
    return out


def row_to_merged_organization(row: ScrapedRow) -> MergedOrganization:
    """Build a MergedOrganization from a single row (no LLM). Use when skipping the agent (e.g. single row, no candidates)."""
    return MergedOrganization(
        canonical_name=row.name or "Unknown",
        organization_type=row.organization_type,
        phone_numbers=row.phone_numbers or [],
        email=row.email,
        websites=row.websites or [],
        official_website=row.official_website,
        year_established=row.year_established,
        accepts_volunteers=row.accepts_volunteers,
        facebook_link=row.facebook_link,
        twitter_link=row.twitter_link,
        linkedin_link=row.linkedin_link,
        instagram_link=row.instagram_link,
        logo=row.logo,
        address_line1=row.address_line1,
        address_line2=row.address_line2,
        address_line3=row.address_line3,
        address_city=row.address_city,
        address_state_or_region=row.address_state_or_region,
        address_zip_or_postcode=row.address_zip_or_postcode,
        address_country=row.address_country,
        address_country_code=row.address_country_code,
        facility_type_id=row.facility_type_id,
        operator_type_id=row.operator_type_id,
        description=row.description,
        area=row.area,
        number_doctors=row.number_doctors,
        capacity=row.capacity,
        countries=row.countries or [],
        mission_statement=row.mission_statement,
        mission_statement_link=row.mission_statement_link,
        organization_description=row.organization_description,
        specialties=row.specialties or [],
        procedure=row.procedure or [],
        equipment=row.equipment or [],
        capability=row.capability or [],
        affiliation_type_ids=row.affiliation_type_ids or [],
    )


def run_merge_agent(
    rows: list[ScrapedRow],
    candidates: list[dict],
    current_org: dict | None = None,
) -> MergeDecision:
    """Public entry: merge one or more rows; one or more orgs (one per location)."""
    return _merge_rows_with_agent(rows, candidates, current_org)


def compute_reliability_for_org(org: dict) -> tuple[float | None, str | None]:
    """Call LLM to assess data reliability for one organization (for backfill). Returns (score 0-10, explanation) or (None, None) on failure."""
    api_key = OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key) if api_key else OpenAI()
    summary = {
        "canonical_name": org.get("canonical_name"),
        "organization_type": org.get("organization_type"),
        "address": f"{org.get('address_line1') or ''}, {org.get('address_city') or ''}, {org.get('address_country') or org.get('address_country_code') or ''}".strip(", "),
        "description": (org.get("description") or "")[:600],
        "facility_type_id": org.get("facility_type_id"),
        "operator_type_id": org.get("operator_type_id"),
        "specialties": org.get("specialties") or [],
        "procedure": org.get("procedure") or [],
        "equipment": org.get("equipment") or [],
        "capability": org.get("capability") or [],
    }
    prompt = f"""Assess the reliability of this health facility/NGO record: does the reported data make sense and match (e.g. facility type vs specialties, procedures vs equipment)? Output JSON only with two keys:
- "reliability_score": number 0-10 (0 = contradictions or nonsensical, 10 = fully consistent and plausible).
- "reliability_explanation": 1-2 sentences on what does not match or what is inconsistent; if everything is consistent, say so briefly.

Record:
{json.dumps(summary, indent=2)}"""
    try:
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw = (resp.choices[0].message.content or "").strip()
        if not raw:
            return (None, None)
        data = json.loads(raw)
        score = data.get("reliability_score")
        expl = data.get("reliability_explanation")
        if score is not None:
            try:
                s = float(score)
                score = max(0.0, min(10.0, s))
            except (TypeError, ValueError):
                score = None
        if expl is not None and not isinstance(expl, str):
            expl = str(expl)[:500] if expl else None
        elif isinstance(expl, str) and len(expl) > 500:
            expl = expl[:500]
        return (score, expl)
    except Exception as e:
        # Re-raise rate limit so callers can stop gracefully and report progress
        from .api_errors import is_rate_limit_error
        if is_rate_limit_error(e):
            raise
        return (None, None)
