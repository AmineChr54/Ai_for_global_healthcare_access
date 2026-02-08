"""Run the ingest pipeline (parse CSV, merge agent, write DB). Use --limit to process only a few groups for testing."""

import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root))

# Load .env from project root (override=True). Fallback: read file manually if dotenv didn't set the key.
_env_path = (root / ".env").resolve()


def _load_env():
    """Load .env and ensure OPENAI_API_KEY is in os.environ. Verbose on failure."""
    loaded = False
    try:
        from dotenv import load_dotenv
        if _env_path.exists():
            loaded = load_dotenv(_env_path, override=True)
        if not loaded and _env_path.exists():
            load_dotenv(override=True)
    except ImportError:
        pass
    # Fallback: if key still missing, read .env manually (handles encoding/line endings)
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key and _env_path.exists():
        try:
            with open(_env_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip().replace("\r", "")
                    if not line or line.startswith("#"):
                        continue
                    if "OPENAI_API_KEY=" in line:
                        val = line.split("OPENAI_API_KEY=", 1)[1].strip()
                        if val.startswith("#"):
                            continue
                        val = val.split("#")[0].strip().strip('"').strip("'")
                        if val:
                            os.environ["OPENAI_API_KEY"] = val
                            key = val
                            break
        except Exception as e:
            if os.getenv("VERBOSE_ENV"):
                print(f"  [verbose] Manual .env read failed: {e}")
    return key


# Load before other imports so config sees the key
_loaded_key = _load_env()

from src.datacleaning.config import DEFAULT_CSV, DATABASE_URL, GEOCODE_ENABLED  # noqa: E402
from src.datacleaning.db import (  # noqa: E402
    get_connection,
    init_db,
    get_organizations_missing_geocode,
    get_organizations_missing_reliability,
    get_organization_for_reliability,
    update_lat_lon,
    update_reliability,
)
from src.datacleaning.geocode import geocode_address  # noqa: E402
from src.datacleaning.merge_agent import compute_reliability_for_org  # noqa: E402
from src.datacleaning.models import MergedOrganization  # noqa: E402
from src.datacleaning.api_errors import is_rate_limit_error, format_rate_limit_message  # noqa: E402
from src.datacleaning.pipeline import process_batch  # noqa: E402


def _run_geocode_backfill(db_url: str) -> None:
    """Fill lat/lon for organizations that have address but no coordinates."""
    conn = get_connection(db_url)
    init_db(conn, db_url)
    orgs = get_organizations_missing_geocode(conn)
    if not orgs:
        print("No organizations need geocoding (all have lat/lon or no address).")
        conn.close()
        return
    print(f"Geocoding {len(orgs)} organization(s) with address but no lat/lon (Nominatim, ~1/sec)...")
    ok, fail = 0, 0
    for o in orgs:
        merged = MergedOrganization(
            canonical_name=o["canonical_name"],
            organization_type="facility",
            address_line1=o.get("address_line1"),
            address_line2=o.get("address_line2"),
            address_line3=o.get("address_line3"),
            address_city=o.get("address_city"),
            address_state_or_region=o.get("address_state_or_region"),
            address_zip_or_postcode=o.get("address_zip_or_postcode"),
            address_country=o.get("address_country"),
            address_country_code=o.get("address_country_code"),
        )
        lat, lon, _display, msg = geocode_address(merged)
        if lat is not None and lon is not None:
            update_lat_lon(conn, o["id"], lat, lon)
            print(f"  Geocoded: {o['canonical_name']!r} -> ({lat:.5f}, {lon:.5f})")
            ok += 1
        else:
            addr = (o.get("address_line1") or o.get("address_city") or "?")[:40]
            print(f"  Skip: {o['canonical_name']!r} -> {msg} ({addr})")
            fail += 1
    conn.close()
    print(f"Done: {ok} geocoded, {fail} failed/skipped.")


def _run_reliability_backfill(db_url: str) -> None:
    """Fill reliability_score and reliability_explanation for organizations that are missing them."""
    conn = get_connection(db_url)
    init_db(conn, db_url)
    org_ids = get_organizations_missing_reliability(conn)
    if not org_ids:
        print("No organizations missing reliability (all have reliability_score set).")
        conn.close()
        return
    print(f"Computing reliability for {len(org_ids)} organization(s) (one LLM call per org)...")
    ok, fail = 0, 0
    rate_limit_hit = False
    for org_id in org_ids:
        org = get_organization_for_reliability(conn, org_id)
        if not org:
            fail += 1
            continue
        try:
            score, explanation = compute_reliability_for_org(org)
        except BaseException as e:
            if is_rate_limit_error(e):
                rate_limit_hit = True
                print("API rate limit reached. Stopping early.")
                print(f"  Error: {format_rate_limit_message(e)}")
                break
            raise
        if score is not None:
            update_reliability(conn, org_id, score, explanation)
            print(f"  {org.get('canonical_name', org_id)!r} -> score={score:.1f}")
            ok += 1
        else:
            print(f"  Skip (LLM failed): {org.get('canonical_name', org_id)!r}")
            fail += 1
    conn.close()
    print(f"Done: {ok} updated, {fail} failed/skipped." + (" Stopped early due to rate limit." if rate_limit_hit else ""))


def main():
    import argparse
    p = argparse.ArgumentParser(description="Ingest scraped CSV into normalized DB (SQLite by default).")
    p.add_argument("--csv", type=Path, default=None, help="Path to CSV (default: data/Virtue Foundation Ghana v0.3 - Sheet1.csv)")
    p.add_argument("--limit", type=int, default=None, help="Process only this many groups (for testing; saves API cost)")
    p.add_argument("--db", type=str, default=None, help="Database URL (default: DATABASE_URL env or sqlite:///health.db)")
    p.add_argument("--verbose-env", action="store_true", help="Print .env loading diagnostics")
    p.add_argument("--geocode-backfill", action="store_true", help="Fill lat/lon for existing orgs that have address but no coordinates (no CSV ingest)")
    p.add_argument("--reliability-backfill", action="store_true", help="Fill reliability_score and reliability_explanation for orgs that are missing them (one LLM call per org)")
    args = p.parse_args()

    db_url = args.db if args.db is not None else DATABASE_URL or "sqlite:///health.db"
    if args.geocode_backfill:
        _run_geocode_backfill(db_url)
        return
    if args.reliability_backfill:
        _run_reliability_backfill(db_url)
        return

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if args.verbose_env or not api_key:
        print("[env] .env path:", _env_path)
        print("[env] .env exists:", _env_path.exists())
        try:
            from dotenv import load_dotenv
            print("[env] dotenv.load_dotenv(override=True) returned:", load_dotenv(_env_path, override=True))
        except ImportError:
            print("[env] python-dotenv not installed (pip install python-dotenv); using manual .env read")
        print("[env] OPENAI_API_KEY in os.environ:", "OPENAI_API_KEY" in os.environ)
        val = os.getenv("OPENAI_API_KEY") or ""
        print("[env] OPENAI_API_KEY length:", len(val), "(value hidden)")
        if _env_path.exists() and not api_key:
            with open(_env_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.strip().startswith("OPENAI_API_KEY="):
                        print("[env] Found OPENAI_API_KEY=... in .env (value hidden)")
                        break
                else:
                    print("[env] No line starting with OPENAI_API_KEY= in .env")
        # Re-run fallback in case dotenv failed; then re-check
        _load_env()
        api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        print("OPENAI_API_KEY is not set. Add it to .env in the project root or set the environment variable.")
        sys.exit(1)

    csv_path = args.csv or DEFAULT_CSV
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        sys.exit(1)
    print(f"Processing {csv_path} -> DB (limit_groups={args.limit})")
    if GEOCODE_ENABLED:
        print("Geocoding: on (lat/lon will be filled from addresses)")
    else:
        print("Geocoding: off (set GEOCODE_ENABLED=1 in .env to fill lat/lon)")
    metrics = process_batch(csv_path=csv_path, limit_groups=args.limit, db_url=db_url)
    if getattr(metrics, "rate_limit_hit", False):
        print("Stopped early: API rate limit reached.")
    print(f"Rows processed: {metrics.rows_processed}. New organizations: {metrics.new_organizations}. Data added to existing: {metrics.appended_to_existing}.")


if __name__ == "__main__":
    main()
