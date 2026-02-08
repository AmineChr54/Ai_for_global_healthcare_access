"""
Preprocessor: ingest DB -> JSON data files for the map frontend.

Generates:
  map/public/data/facilities.json  — facility array (with lat/lon from DB or geocoding)
  map/public/data/analysis.json   — medical deserts, coverage grid, region stats, specialty distribution

Run: python scripts/prepare_map_data.py
     python scripts/prepare_map_data.py --debug   # verbose diagnostics

Uses DATABASE_URL (default sqlite:///ghana_dataset/health.db). Empty DB outputs empty/minimal data.
"""

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.datacleaning.db import get_connection, init_db
from src.datacleaning.config import DATABASE_URL
from src.tools.geocoding import GHANA_CITIES, geocode, haversine_km
from src.nodes.external_data_agent import GHANA_CONTEXT

OUT_DIR = PROJECT_ROOT / "map" / "public" / "data"
REGION_POPULATION = GHANA_CONTEXT["population"]["regions"]
WHO = GHANA_CONTEXT["who_guidelines"]

# Debug mode: print DB path, row counts, skip reasons
DEBUG = os.environ.get("DEBUG", "").strip().lower() in ("1", "true", "yes")


def _str_phone(raw) -> str:
    """Turn phone_numbers (JSON array or comma-separated) into one display string."""
    if not raw:
        return ""
    s = str(raw).strip()
    if not s or s in ("null", "[]"):
        return ""
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                parts = [str(x).strip() for x in parsed if x]
                return ", ".join(parts) if parts else ""
        except (json.JSONDecodeError, TypeError):
            pass
    return ", ".join(x.strip() for x in s.split(",") if x.strip())


def _parse_list_field(raw) -> list:
    """Parse comma-separated or JSON array string into list of strings."""
    if not raw or (isinstance(raw, str) and raw.strip() in ("", "null", "[]")):
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if x]
    s = str(raw).strip()
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            return [str(x).strip() for x in parsed if x] if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            pass
    return [x.strip() for x in s.split(",") if x.strip()]


def _run_query(conn, sql, params=None):
    """Run a query and return (columns, rows). Works with sqlite3 or psycopg."""
    if hasattr(conn, "execute"):
        cur = conn.execute(sql, params or ())
        if hasattr(cur, "fetchall"):
            rows = cur.fetchall()
        else:
            rows = list(cur)
        columns = [d[0] for d in (cur.description or [])] if hasattr(cur, "description") else []
    else:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        columns = [d[0] for d in (cur.description or [])]
        rows = cur.fetchall()
    return columns, rows


def _resolve_db_url(db_url: str) -> str:
    """Resolve relative SQLite paths to PROJECT_ROOT so the same DB is used regardless of cwd."""
    url = (db_url or "").strip()
    if not url.startswith("sqlite:///"):
        return url
    path_part = url.replace("sqlite:///", "").strip()
    if not path_part:
        return url
    p = Path(path_part)
    if p.is_absolute():
        return url
    # Relative path: resolve against project root
    resolved = PROJECT_ROOT / path_part
    return f"sqlite:///{resolved}"


def _db_path_for_debug(db_url: str) -> str:
    """Return a short description of the DB location for debug output."""
    url = (db_url or "").strip()
    if url.startswith("sqlite:///"):
        path_part = url.replace("sqlite:///", "")
        p = Path(path_part)
        if not p.is_absolute():
            p = PROJECT_ROOT / path_part
        return str(p.resolve())
    if "@" in url and "//" in url:
        return url.split("@")[-1].split("?")[0] or url
    return url


def load_facilities_from_db(debug: bool = False):
    """Load facilities from ingest DB organizations table (and optional specialties/facts). Uses lat/lon from DB or geocode."""
    db_url = DATABASE_URL or "sqlite:///ghana_dataset/health.db"
    db_url = _resolve_db_url(db_url)
    if debug or DEBUG:
        print(f"  [debug] DATABASE_URL resolved: {_db_path_for_debug(db_url)}")
    conn = get_connection(db_url)
    try:
        # Ensure schema exists (creates organizations + related tables if missing)
        init_db(conn, db_url)
        # Read from organizations table directly (no facilities view required)
        try:
            columns, rows = _run_query(conn, "SELECT id, canonical_name, organization_type, address_city, address_state_or_region, lat, lon, facility_type_id, operator_type_id, number_doctors, capacity, description, official_website, phone_numbers, email FROM organizations")
        except Exception as e:
            print(f"  Warning: could not read organizations table: {e}")
            if debug or DEBUG:
                try:
                    tc, tr = _run_query(conn, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                    if tr:
                        print(f"  [debug] Tables in DB: {[r[0] for r in tr]}")
                except Exception:
                    pass
            return []

        n_rows = len(rows)
        if debug or DEBUG:
            print(f"  [debug] organizations: {n_rows} rows")
            if columns:
                print(f"  [debug] Columns: {columns}")
            if rows and (debug or DEBUG):
                first = dict(zip(columns, rows[0])) if not hasattr(rows[0], "keys") else dict(rows[0])
                print(f"  [debug] First row keys (sample): {list(first.keys())}")

        # Optional: load specialties and facts if tables exist
        specialties_by_id = {}
        facts_by_id = {}
        try:
            sc, sr = _run_query(conn, "SELECT organization_id, specialty FROM organization_specialties")
            for r in sr:
                row = dict(zip(sc, r)) if not hasattr(r, "keys") else dict(r)
                oid = row.get("organization_id")
                if oid:
                    specialties_by_id.setdefault(oid, []).append((row.get("specialty") or "").strip())
            fc, fr = _run_query(conn, "SELECT organization_id, fact_type, value FROM organization_facts")
            for r in fr:
                row = dict(zip(fc, r)) if not hasattr(r, "keys") else dict(r)
                oid = row.get("organization_id")
                if oid:
                    facts_by_id.setdefault(oid, {"procedure": [], "equipment": [], "capability": []})
                    ft = (row.get("fact_type") or "").strip()
                    if ft in facts_by_id[oid]:
                        facts_by_id[oid][ft].append((row.get("value") or "").strip())
        except Exception as ex:
            if debug or DEBUG:
                print(f"  [debug] Optional tables (specialties/facts): {ex}")
            pass

        if debug or DEBUG:
            print(f"  [debug] Specialties for {len(specialties_by_id)} orgs, facts for {len(facts_by_id)} orgs")

        facilities = []
        skipped_no_geocode = 0
        skipped_bad_coords = 0
        for row in rows:
            if not columns:
                continue
            row_dict = dict(zip(columns, row)) if not hasattr(row, "keys") else dict(row)
            oid = str(row_dict.get("id", ""))
            city = (row_dict.get("address_city") or "").strip() or ""
            region = (row_dict.get("address_state_or_region") or "").strip() or ""
            lat = row_dict.get("lat")
            lon = row_dict.get("lon")
            if lat is None or lon is None:
                coords = geocode(city or None, region or None)
                if not coords:
                    skipped_no_geocode += 1
                    if (debug or DEBUG) and skipped_no_geocode <= 3:
                        print(f"  [debug] Skip (no geocode): id={oid!r} city={city!r} region={region!r}")
                    continue
                lat, lon = coords[0], coords[1]
            else:
                try:
                    lat, lon = float(lat), float(lon)
                except (TypeError, ValueError):
                    coords = geocode(city or None, region or None)
                    if not coords:
                        skipped_no_geocode += 1
                        continue
                    lat, lon = coords[0], coords[1]

            doctors = row_dict.get("number_doctors")
            beds = row_dict.get("capacity")
            try:
                doctors = int(doctors) if doctors is not None else None
            except (TypeError, ValueError):
                doctors = None
            try:
                beds = int(beds) if beds is not None else None
            except (TypeError, ValueError):
                beds = None

            specs = specialties_by_id.get(oid, [])
            facts = facts_by_id.get(oid, {})
            facilities.append({
                "id": oid,
                "uid": oid,
                "name": (row_dict.get("canonical_name") or "").strip() or "Unknown",
                "lat": round(float(lat), 5),
                "lon": round(float(lon), 5),
                "city": city,
                "region": region,
                "type": (row_dict.get("facility_type_id") or "").strip() or "",
                "operator": (row_dict.get("operator_type_id") or "").strip() or "",
                "specialties": [s for s in specs if s],
                "procedures": facts.get("procedure", []),
                "equipment": facts.get("equipment", []),
                "capabilities": facts.get("capability", []),
                "doctors": doctors,
                "beds": beds,
                "orgType": (row_dict.get("organization_type") or "facility").strip() or "facility",
                "description": (row_dict.get("description") or "").strip() or "",
                "website": (row_dict.get("official_website") or "").strip() or "",
                "phone": _str_phone(row_dict.get("phone_numbers")),
                "email": (row_dict.get("email") or "").strip() or "",
            })
        if debug or DEBUG:
            print(f"  [debug] Output {len(facilities)} facilities, skipped (no geocode): {skipped_no_geocode}, skipped (bad coords): {skipped_bad_coords}")
        if not facilities and not (debug or DEBUG):
            path_str = _db_path_for_debug(db_url)
            if n_rows == 0:
                print(f"  [info] DB: {path_str} ; organizations: 0 rows (empty or wrong DB?).")
            else:
                print(f"  [info] DB: {path_str} ; organizations: {n_rows} rows but 0 output (all skipped?). Run with --debug for details.")
        return facilities
    finally:
        try:
            conn.close()
        except Exception:
            pass


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
            index = min(count / 10.0, 1.0)
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
    parser = argparse.ArgumentParser(description="Generate map data (facilities.json, analysis.json) from ingest DB.")
    parser.add_argument("--debug", action="store_true", help="Print DB path, row counts, skip reasons")
    args = parser.parse_args()
    debug = args.debug or DEBUG

    print("Loading facilities from ingest DB...")
    facilities = load_facilities_from_db(debug=debug)
    print(f"  Loaded {len(facilities)} facilities")

    if not facilities:
        print("  No facilities in DB; analysis will be minimal.")

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

    seen = set()
    deduped = []
    for f in facilities:
        key = (f["name"], f["city"])
        if key not in seen:
            seen.add(key)
            deduped.append(f)
    if len(facilities) != len(deduped):
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
