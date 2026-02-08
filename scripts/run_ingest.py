#!/usr/bin/env python3
"""
Run CSV ingest with a file path and optional limit.

Usage (note: first arg is the SCRIPT, second is the CSV path):
  poetry run python scripts/run_ingest.py path/to/facilities.csv
  poetry run python scripts/run_ingest.py path/to/facilities.csv --limit 10
  poetry run python scripts/run_ingest.py "C:\\path\\to\\facilities.csv" -l 5

Wrong: poetry run python yourfile.csv --limit 2   (that runs the CSV as Python and will error)
Right: poetry run python scripts/run_ingest.py yourfile.csv --limit 2

The limit caps the number of row groups (by pk_unique_id) processed; useful for testing.
Uses DATABASE_URL from .env (or Databricks secrets) if --db is not given.
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure project root is on path when running script directly
_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from src.datacleaning.pipeline import ingest_csv, refresh_map_data_after_ingest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a CSV into the health database (new orgs or append to existing).",
        epilog="Example: python scripts/run_ingest.py ghana_dataset/data.csv --limit 10",
    )
    parser.add_argument(
        "csv_path",
        type=Path,
        help="Path to the CSV file (e.g. ghana_dataset/Virtue Foundation Ghana v0.3 - Sheet1.csv)",
    )
    parser.add_argument(
        "-l",
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N row groups (by pk_unique_id). Omit to process all.",
    )
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        metavar="URL",
        help="Database URL (default: from .env DATABASE_URL or sqlite:///ghana_dataset/health.db)",
    )
    args = parser.parse_args()

    if not args.csv_path.exists():
        print(f"Error: CSV file not found: {args.csv_path}", file=sys.stderr)
        sys.exit(1)

    csv_path_str = str(args.csv_path.resolve())
    print(f"Ingesting: {csv_path_str}")
    if args.limit is not None:
        print(f"Limit: {args.limit} row groups")
    if args.db:
        print(f"Database: {args.db}")
        os.environ["DATABASE_URL"] = args.db

    try:
        metrics = ingest_csv(
            csv_path=csv_path_str,
            limit_groups=args.limit,
            db_url=args.db,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print("Done.")
    print(f"  Rows processed:        {metrics['rows_processed']}")
    print(f"  New organizations:     {metrics['new_organizations']}")
    print(f"  Appended to existing:  {metrics['appended_to_existing']}")
    if metrics.get("rate_limit_hit"):
        print("  (Stopped early: API rate limit hit.)")

    # Pipeline: refresh map data so the map frontend is up to date
    print("Updating map data (facilities.json, analysis.json)...")
    if refresh_map_data_after_ingest(db_url=args.db):
        print("  Map data updated.")
    else:
        print("  Warning: prepare_map_data failed or not found; map may be stale.", file=sys.stderr)


if __name__ == "__main__":
    main()
