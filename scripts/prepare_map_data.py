"""
Preprocessor: CSV + geocoding -> JSON data files for the map frontend.

Generates:
  map/public/data/facilities.json  — geocoded facility array
  map/public/data/analysis.json    — medical deserts, coverage grid, region stats, specialty distribution

Run: python scripts/prepare_map_data.py
"""

import csv
import json
import math
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.tools.geocoding import GHANA_CITIES, GHANA_REGIONS, geocode, haversine_km
from src.nodes.external_data_agent import GHANA_CONTEXT

CSV_PATH = PROJECT_ROOT / "ghana_dataset" / "Virtue Foundation Ghana v0.3 - Sheet1.csv"
OUT_DIR = PROJECT_ROOT / "map" / "public" / "data"

REGION_POPULATION = GHANA_CONTEXT["population"]["regions"]
WHO = GHANA_CONTEXT["who_guidelines"]


def parse_json_field(raw):
    if not raw or raw in ("null", "[]", ""):
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def load_and_geocode_facilities():
    facilities = []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            city = row.get("address_city", "")
            region = row.get("address_stateOrRegion", "")
            coords = geocode(city if city != "null" else None,
                             region if region != "null" else None)
            if not coords:
                continue

            doctors = row.get("numberDoctors", "")
            beds = row.get("capacity", "")

            facilities.append({
                "id": row.get("pk_unique_id", ""),
                "uid": row.get("unique_id", ""),
                "name": row.get("name", ""),
                "lat": round(coords[0], 5),
                "lon": round(coords[1], 5),
                "city": city if city != "null" else "",
                "region": region if region != "null" else "",
                "type": row.get("facilityTypeId", "") or "",
                "operator": row.get("operatorTypeId", "") or "",
                "specialties": parse_json_field(row.get("specialties", "")),
                "procedures": parse_json_field(row.get("procedure", "")),
                "equipment": parse_json_field(row.get("equipment", "")),
                "capabilities": parse_json_field(row.get("capability", "")),
                "doctors": int(doctors) if doctors and doctors != "null" else None,
                "beds": int(beds) if beds and beds != "null" else None,
                "orgType": row.get("organization_type", "facility"),
                "description": row.get("description", "") or "",
                "website": row.get("officialWebsite", "") or "",
            })
    return facilities


def compute_medical_deserts(facilities, radius_km=50):
    """Cities with no hospital within radius_km."""
    hospital_coords = [
        (f["lat"], f["lon"])
        for f in facilities
        if f["type"] in ("hospital",) and f["orgType"] == "facility"
    ]
    deserts = []
    for city_name, (lat, lon) in GHANA_CITIES.items():
        if not hospital_coords:
            nearest = None
        else:
            nearest = min(haversine_km(lat, lon, h[0], h[1]) for h in hospital_coords)
        if nearest is None or nearest > radius_km:
            pop = None
            for rname, rpop in REGION_POPULATION.items():
                if rname.lower() in city_name.lower() or city_name.lower() in rname.lower():
                    pop = rpop
                    break
            deserts.append({
                "city": city_name.title(),
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "nearestHospitalKm": round(nearest, 1) if nearest else None,
                "population": pop,
            })
    deserts.sort(key=lambda x: x.get("nearestHospitalKm") or 9999, reverse=True)
    return deserts


def compute_coverage_grid(facilities, step=0.25, radius_km=50):
    """Grid of coverage scores across Ghana."""
    hospital_coords = [
        (f["lat"], f["lon"])
        for f in facilities
        if f["type"] in ("hospital", "clinic") and f["orgType"] == "facility"
    ]
    grid = []
    lat_min, lat_max = 4.5, 11.5
    lon_min, lon_max = -3.5, 1.5
    lat = lat_min
    while lat <= lat_max:
        lon = lon_min
        while lon <= lon_max:
            count = sum(
                1 for h in hospital_coords
                if haversine_km(lat, lon, h[0], h[1]) <= radius_km
            )
            index = min(count / 10.0, 1.0)  # Normalize: 10+ facilities = 1.0
            grid.append({
                "lat": round(lat, 3),
                "lon": round(lon, 3),
                "coverageIndex": round(index, 3),
                "facilityCount": count,
            })
            lon += step
        lat += step
    return grid


def compute_region_stats(facilities):
    """Per-region aggregate statistics."""
    stats = {}
    for f in facilities:
        r = f.get("region", "") or "Unknown"
        if r not in stats:
            stats[r] = {
                "facilities": 0, "hospitals": 0, "clinics": 0,
                "ngos": 0, "doctorsReported": 0, "bedsReported": 0,
                "specialties": {},
            }
        s = stats[r]
        s["facilities"] += 1
        if f["type"] == "hospital":
            s["hospitals"] += 1
        elif f["type"] == "clinic":
            s["clinics"] += 1
        if f["orgType"] == "ngo":
            s["ngos"] += 1
        if f["doctors"]:
            s["doctorsReported"] += f["doctors"]
        if f["beds"]:
            s["bedsReported"] += f["beds"]
        for spec in f.get("specialties", []):
            s["specialties"][spec] = s["specialties"].get(spec, 0) + 1

    # Add population data
    for rname, rpop in REGION_POPULATION.items():
        for key in stats:
            if rname.lower() in key.lower() or key.lower() in rname.lower():
                stats[key]["population"] = rpop
                break

    return stats


def compute_specialty_distribution(facilities):
    """Per-specialty counts and regional breakdown."""
    dist = {}
    for f in facilities:
        for spec in f.get("specialties", []):
            if spec not in dist:
                dist[spec] = {"total": 0, "regions": {}}
            dist[spec]["total"] += 1
            r = f.get("region", "") or "Unknown"
            dist[spec]["regions"][r] = dist[spec]["regions"].get(r, 0) + 1

    return dict(sorted(dist.items(), key=lambda x: x[1]["total"], reverse=True))


def main():
    print("Loading and geocoding facilities...")
    facilities = load_and_geocode_facilities()
    print(f"  Geocoded {len(facilities)} facilities")

    print("Computing medical deserts...")
    deserts = compute_medical_deserts(facilities)
    print(f"  Found {len(deserts)} desert locations")

    print("Computing coverage grid...")
    grid = compute_coverage_grid(facilities)
    print(f"  Grid has {len(grid)} points")

    print("Computing region stats...")
    region_stats = compute_region_stats(facilities)
    print(f"  {len(region_stats)} regions")

    print("Computing specialty distribution...")
    spec_dist = compute_specialty_distribution(facilities)
    print(f"  {len(spec_dist)} specialties")

    # Deduplicate facilities by name+city (keep first)
    seen = set()
    deduped = []
    for f in facilities:
        key = (f["name"], f["city"])
        if key not in seen:
            seen.add(key)
            deduped.append(f)
    print(f"  Deduplicated: {len(facilities)} -> {len(deduped)} unique facilities")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUT_DIR / "facilities.json", "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=None)
    print(f"  Wrote facilities.json ({len(deduped)} records)")

    analysis = {
        "medicalDeserts": deserts,
        "coverageGrid": grid,
        "regionStats": region_stats,
        "specialtyDistribution": spec_dist,
        "regionPopulation": REGION_POPULATION,
        "whoGuidelines": WHO,
        "ghanaHealthStats": GHANA_CONTEXT["ghana_health_stats"],
    }
    with open(OUT_DIR / "analysis.json", "w", encoding="utf-8") as f:
        json.dump(analysis, f, ensure_ascii=False, indent=None)
    print(f"  Wrote analysis.json")

    print("Done!")


if __name__ == "__main__":
    main()
