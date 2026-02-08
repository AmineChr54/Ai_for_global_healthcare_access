"""Run the CSV parser and print stats. Usage: python run_parser.py [path/to/file.csv]"""

import sys
from pathlib import Path

# Allow running from project root without installing
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.datacleaning.parser import group_by_pk_unique_id, load_rows


def main() -> None:
    csv_path = sys.argv[1] if len(sys.argv) > 1 else None
    rows = load_rows(csv_path)
    groups = group_by_pk_unique_id(rows)
    with_id = sum(len(g) for k, g in groups.items() if k is not None)
    without_id = len(groups.get(None, []))
    print(f"Total rows: {len(rows)}")
    print(f"With pk_unique_id: {with_id} (in {len([k for k in groups if k is not None])} groups)")
    print(f"Without pk_unique_id: {without_id}")
    if rows:
        r0 = rows[0]
        print(f"Sample identity: {r0.name} | {r0.address_city} | {r0.address_line1}")


if __name__ == "__main__":
    main()
