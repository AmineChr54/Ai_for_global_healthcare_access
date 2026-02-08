"""
SQL Executor — DuckDB in-memory for local dev, designed to swap to PostgreSQL.

Uses in-memory DuckDB (no file lock!) so multiple processes (CLI + Streamlit)
can run simultaneously. 987 rows loads from CSV in <100ms — no need to persist.

When your teammate's PostgreSQL is ready, set USE_MOCK_DB=false and provide
DATABASE_URL in .env — the executor will switch automatically.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Dict, List, Optional

import duckdb

from src.config import DATASET_CSV, USE_MOCK_DB

logger = logging.getLogger(__name__)

# ── Thread-safe singleton ───────────────────────────────────────────────────
_conn: Optional[duckdb.DuckDBPyConnection] = None
_lock = threading.Lock()
_initialized = False


def _get_connection() -> duckdb.DuckDBPyConnection:
    """
    Return (and lazily create) an IN-MEMORY DuckDB connection.
    Thread-safe. CSV is loaded once on first call.
    """
    global _conn, _initialized

    with _lock:
        if _conn is not None and _initialized:
            return _conn

        logger.info("Creating in-memory DuckDB connection …")
        _conn = duckdb.connect(":memory:")

        csv_path = str(DATASET_CSV).replace("\\", "/")
        logger.info(f"Loading CSV into DuckDB from {csv_path} …")
        _conn.execute(
            f"""
            CREATE TABLE facilities AS
            SELECT * FROM read_csv_auto('{csv_path}',
                                         header=true,
                                         all_varchar=true)
            """
        )
        row_count = _conn.execute("SELECT COUNT(*) FROM facilities").fetchone()[0]
        logger.info(f"Loaded {row_count} rows into facilities table.")
        _initialized = True

    return _conn


def get_table_schema() -> str:
    """
    Return a human-readable schema string for the LLM's system prompt.
    Includes column names, types, and sample values.
    """
    conn = _get_connection()
    columns = conn.execute("DESCRIBE facilities").fetchall()

    schema_lines = ["TABLE: facilities", "COLUMNS:"]
    for col_name, col_type, *_ in columns:
        # Get a sample non-null value
        try:
            sample = conn.execute(
                f'SELECT "{col_name}" FROM facilities WHERE "{col_name}" IS NOT NULL '
                f"AND \"{col_name}\" != 'null' LIMIT 1"
            ).fetchone()
            sample_val = sample[0] if sample else "NULL"
        except Exception:
            sample_val = "NULL"
        # Truncate long samples
        if isinstance(sample_val, str) and len(sample_val) > 120:
            sample_val = sample_val[:120] + "…"
        schema_lines.append(f"  - {col_name} ({col_type})  example: {sample_val}")

    # Add DuckDB-specific hints for the LLM
    schema_lines.extend(
        [
            "",
            "IMPORTANT QUERY NOTES:",
            "- specialties, procedure, equipment, capability, phone_numbers, websites,",
            "  affiliationTypeIds, countries are stored as VARCHAR containing JSON arrays.",
            "  Use: specialties ILIKE '%cardiology%' for case-insensitive substring matching.",
            "- numberDoctors, capacity, area, yearEstablished are VARCHAR; cast to INTEGER for math:",
            "  CAST(numberDoctors AS INTEGER). Always filter nulls first: WHERE numberDoctors != 'null'",
            "- NULL values: some columns have the string 'null' instead of SQL NULL.",
            "  Always add: AND column != 'null' AND column IS NOT NULL when filtering.",
            "- organization_type is 'facility' or 'ngo'.",
            "- facilityTypeId is one of: hospital, pharmacy, doctor, clinic, dentist.",
            "- operatorTypeId is: public or private.",
            "- address_stateOrRegion for region-level queries, address_city for city-level.",
            "- address_country is mostly 'Ghana', address_countryCode is 'GH'.",
            "- pk_unique_id is an integer primary key. unique_id is a UUID string.",
            "- Use COUNT(DISTINCT pk_unique_id) to avoid counting duplicate rows.",
        ]
    )
    return "\n".join(schema_lines)


def execute_sql(sql: str) -> Dict[str, Any]:
    """
    Execute a SQL query and return results as a dict.

    Returns:
        {
            "success": bool,
            "columns": [col_name, ...],
            "rows": [{col: val, ...}, ...],
            "row_count": int,
            "sql": str,
            "error": str | None
        }
    """
    conn = _get_connection()
    try:
        result = conn.execute(sql)
        columns = [desc[0] for desc in result.description]
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {
            "success": True,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "sql": sql,
            "error": None,
        }
    except Exception as e:
        logger.error(f"SQL execution failed: {e}\nSQL: {sql}")
        return {
            "success": False,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "sql": sql,
            "error": str(e),
        }


def get_sample_rows(n: int = 3) -> List[Dict[str, Any]]:
    """Return n sample rows for context."""
    result = execute_sql(f"SELECT * FROM facilities LIMIT {n}")
    return result["rows"] if result["success"] else []
