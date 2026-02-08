"""
Layer 3c: Geospatial Agent

Distance & cold-spot calculations using facility coordinates.
Since the CSV has no lat/lon, we geocode from city/region names using
a lookup table of known Ghana locations.

Covers: Q2.1, Q2.2, Q2.3, Q2.4, Q8.3 — "medical desert" identification
(Social Impact = 25% of scoring).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from src.config import OPENAI_API_KEY, OPENAI_MODEL
from src.state import AgentState
from src.tools.geocoding import (
    GHANA_CITIES,
    GHANA_REGIONS,
    facilities_within_radius,
    find_cold_spots,
    geocode,
    haversine_km,
)
from src.tools.sql_executor import execute_sql

logger = logging.getLogger(__name__)


GEO_SYSTEM_PROMPT = """You are a geospatial analysis agent for Ghana healthcare data.

You have access to:
- Facility locations (cities/regions across Ghana, geocoded to approximate coordinates)
- Distance calculation (haversine / geodesic)
- Cold-spot detection (areas with no facility within X km)

AVAILABLE GHANA CITIES (with coordinates): {cities}
AVAILABLE GHANA REGIONS: {regions}

Given the user's query, determine:
1. What type of geospatial analysis is needed
2. Key parameters (center location, radius in km, specialty filter, etc.)

Analysis types:
- "radius_search": Find facilities within X km of a location
- "cold_spot": Find areas with no facility (optionally with specific specialty) within X km
- "nearest": Find nearest facility to a location
- "distribution": Analyze geographic distribution of a specialty/service

Respond with:
- "analysis_type": one of the types above
- "center_city": city name for center point (if applicable)
- "center_region": region for center point (if applicable)
- "radius_km": search radius in km (default 50)
- "specialty_filter": medical specialty to filter by (if applicable, use dataset terms like "cardiology", "ophthalmology")
- "facility_type_filter": facility type (hospital, clinic, etc.) if applicable
"""


class GeoParams(BaseModel):
    analysis_type: str = Field(description="Type: radius_search | cold_spot | nearest | distribution")
    center_city: str = Field(default="", description="City name for center")
    center_region: str = Field(default="", description="Region for center")
    radius_km: float = Field(default=50.0, description="Radius in km")
    specialty_filter: str = Field(default="", description="Specialty to filter by")
    facility_type_filter: str = Field(default="", description="Facility type filter")


def execute_geospatial(state: AgentState) -> Dict[str, Any]:
    """
    Layer 3c node: geospatial analysis — distances, cold spots, service areas.

    Reads: state["rewritten_query"], state["query_plan"]
    Writes: state["geo_results"]
    """
    rewritten = state.get("rewritten_query", state.get("query", ""))

    cities_str = ", ".join(sorted(GHANA_CITIES.keys())[:50])
    regions_str = ", ".join(sorted(GHANA_REGIONS.keys()))

    llm = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0)
    structured_llm = llm.with_structured_output(GeoParams)

    params: GeoParams = structured_llm.invoke(
        [
            {
                "role": "system",
                "content": GEO_SYSTEM_PROMPT.format(cities=cities_str, regions=regions_str),
            },
            {"role": "user", "content": rewritten},
        ]
    )

    logger.info(f"Geo analysis: {params.analysis_type}, center={params.center_city or params.center_region}, radius={params.radius_km}km")

    # Fetch all facilities from DB
    spec_filter = ""
    if params.specialty_filter:
        spec_filter = f"AND specialties LIKE '%{params.specialty_filter}%'"
    type_filter = ""
    if params.facility_type_filter:
        type_filter = f"AND facilityTypeId = '{params.facility_type_filter}'"

    sql = f"""
        SELECT pk_unique_id, name, address_city, address_stateOrRegion,
               specialties, facilityTypeId, numberDoctors, capacity,
               organization_type
        FROM facilities
        WHERE organization_type = 'facility'
        {spec_filter} {type_filter}
    """
    db_result = execute_sql(sql)
    facilities = db_result["rows"] if db_result["success"] else []

    result: Dict[str, Any] = {"analysis_type": params.analysis_type, "parameters": {}}

    if params.analysis_type == "cold_spot":
        cold_spots = find_cold_spots(
            facilities,
            specialty_filter=params.specialty_filter or None,
            radius_km=params.radius_km,
        )
        result["cold_spots"] = cold_spots[:20]
        result["total_cold_spots"] = len(cold_spots)
        result["parameters"] = {
            "radius_km": params.radius_km,
            "specialty": params.specialty_filter,
        }

    elif params.analysis_type in ("radius_search", "nearest"):
        coords = geocode(params.center_city or None, params.center_region or None)
        if coords:
            nearby = facilities_within_radius(
                facilities, coords[0], coords[1], params.radius_km
            )
            result["facilities_found"] = nearby[:30]
            result["total_found"] = len(nearby)
            result["center"] = {"lat": coords[0], "lon": coords[1],
                                "city": params.center_city, "region": params.center_region}
            result["parameters"] = {"radius_km": params.radius_km}
        else:
            result["error"] = f"Could not geocode: city={params.center_city}, region={params.center_region}"

    elif params.analysis_type == "distribution":
        # Group facilities by region
        region_counts: Dict[str, int] = {}
        for fac in facilities:
            region = fac.get("address_stateOrRegion", "Unknown")
            region_counts[region] = region_counts.get(region, 0) + 1
        result["distribution"] = dict(sorted(region_counts.items(), key=lambda x: x[1], reverse=True))
        result["total_facilities"] = len(facilities)

    return {"geo_results": result}
