"""
SQL Executor — SQLite database (same as map: ghana_dataset/health.db).

Uses the `facilities` VIEW from the ingest schema so the agent's SQL and schema
match the existing pipeline. No DuckDB dependency.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List

from src.datacleaning.config import DATABASE_URL, PROJECT_ROOT
from src.datacleaning.db import get_connection, init_db

logger = logging.getLogger(__name__)


def _resolve_db_url(db_url: str) -> str:
    """Resolve relative SQLite paths to PROJECT_ROOT."""
    url = (db_url or "").strip()
    if not url.startswith("sqlite:///"):
        return url
    path_part = url.replace("sqlite:///", "").strip()
    if not path_part:
        return url
    p = Path(path_part)
    if p.is_absolute():
        return url
    resolved = PROJECT_ROOT / path_part
    return f"sqlite:///{resolved}"


def _get_connection():
    """Return a connection to the SQLite DB (facilities VIEW). Ensures schema exists."""
    db_url = _resolve_db_url(DATABASE_URL or "sqlite:///ghana_dataset/health.db")
    conn = get_connection(db_url)
    init_db(conn, db_url)
    return conn


def get_table_schema() -> str:
    """
    Return a human-readable schema string for the LLM's system prompt.
    Uses the facilities VIEW (organizations + specialties + facts).
    """
    conn = _get_connection()
    try:
        rows = conn.execute("PRAGMA table_info(facilities)").fetchall()
    except Exception as e:
        logger.warning(f"Could not read facilities VIEW: {e}. Schema may be uninitialized.")
        try:
            conn.close()
        except Exception:
            pass
        return (
            "TABLE: facilities\n"
            "COLUMNS: (schema not available — run init_db or prepare_map_data first)\n\n"
            "IMPORTANT: Use LIKE for substring matching (SQLite has no ILIKE). "
            "Columns: pk_unique_id, name, address_city, address_stateOrRegion, facilityTypeId, "
            "operatorTypeId, numberDoctors, capacity, organization_type, specialties, procedure, equipment, capability."
        )

    schema_lines = ["TABLE: facilities", "COLUMNS:"]
    for row in rows:
        # PRAGMA table_info: cid, name, type, notnull, dflt_value, pk
        col_name = row[1]
        col_type = row[2] or "TEXT"
        try:
            sample = conn.execute(
                f'SELECT "{col_name}" FROM facilities WHERE "{col_name}" IS NOT NULL AND "{col_name}" != \'\' LIMIT 1'
            ).fetchone()
            sample_val = sample[0] if sample else "NULL"
        except Exception:
            sample_val = "NULL"
        if isinstance(sample_val, str) and len(sample_val) > 120:
            sample_val = sample_val[:120] + "…"
        schema_lines.append(f"  - {col_name} ({col_type})  example: {sample_val}")

    schema_lines.extend([
        "",
        "IMPORTANT QUERY NOTES (SQLite):",
        "- Use LIKE for substring matching (SQLite has no ILIKE). Example: specialties LIKE '%cardiology%'.",
        "- For case-insensitive match use: LOWER(column) LIKE LOWER('%term%').",
        "- specialties, procedure, equipment, capability are TEXT (comma-separated or JSON). Use LIKE for substring.",
        "- numberDoctors, capacity, area, yearEstablished are INTEGER or TEXT; cast if needed: CAST(numberDoctors AS INTEGER).",
        "- Filter nulls: WHERE column IS NOT NULL AND column != 'null'.",
        "- organization_type is 'facility' or 'ngo'.",
        "- facilityTypeId: hospital, pharmacy, doctor, clinic, dentist.",
        "- operatorTypeId: public or private.",
        "- address_stateOrRegion for region, address_city for city.",
        "- Use COUNT(DISTINCT pk_unique_id) to avoid duplicate counts.",
    ])
    try:
        conn.close()
    except Exception:
        pass
    return "\n".join(schema_lines)


def execute_sql(sql: str) -> Dict[str, Any]:
    """
    Execute a SQL query against the facilities VIEW and return results.

    Converts ILIKE to SQLite-compatible LOWER(...) LIKE LOWER(...) so LLM-generated SQL works.
    """
    # SQLite has no ILIKE; convert "col ILIKE 'pattern'" to "LOWER(col) LIKE LOWER('pattern')"
    def _ilike_repl(m: re.Match) -> str:
        left = m.group(1).strip()
        right = m.group(2)
        return f"LOWER({left}) LIKE LOWER({right})"

    sql = re.sub(
        r"(\w+(?:\.\w+)?)\s+ILIKE\s+('(?:[^']|'')*')",
        _ilike_repl,
        sql,
        flags=re.IGNORECASE,
    )

    conn = _get_connection()
    try:
        result = conn.execute(sql)
        columns = [desc[0] for desc in result.description] if result.description else []
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
    finally:
        try:
            conn.close()
        except Exception:
            pass


def search_free_text(term: str, top_k: int = 15) -> List[Dict[str, Any]]:
    """
    Search procedure, equipment, capability columns via SQL LIKE (no embeddings).
    Returns the same shape as vector_search for pipeline compatibility:
    list of {text, facility_id, facility_name, field, region, city, facility_type, score}.
    """
    conn = _get_connection()
    try:
        # Escape single quotes in term for SQL
        safe = term.replace("'", "''")
        like = f"%{safe}%"
        sql = """
            SELECT pk_unique_id, name, address_city, address_stateOrRegion, facilityTypeId,
                   organization_type, procedure, equipment, capability
            FROM facilities
            WHERE LOWER(procedure) LIKE LOWER(?) OR LOWER(equipment) LIKE LOWER(?) OR LOWER(capability) LIKE LOWER(?)
            LIMIT ?
        """
        cur = conn.execute(sql, (like, like, like, max(top_k, 50)))
        columns = [d[0] for d in (cur.description or [])]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as e:
        logger.warning(f"Free-text SQL search failed: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # Explode into one result per matching field (procedure/equipment/capability) so shape matches vector_search
    results: List[Dict[str, Any]] = []
    term_lower = term.lower()
    for row in rows:
        fac_id = str(row.get("pk_unique_id", ""))
        fac_name = row.get("name", "")
        region = row.get("address_stateOrRegion") or ""
        city = row.get("address_city") or ""
        fac_type = row.get("facilityTypeId") or ""
        org_type = row.get("organization_type") or ""
        for field_name in ("procedure", "equipment", "capability"):
            raw = row.get(field_name)
            if not raw or not isinstance(raw, str):
                continue
            # Split by comma (group_concat format) or use whole string
            parts = [p.strip() for p in raw.split(",") if p.strip()]
            if not parts:
                if term_lower in raw.lower():
                    results.append({
                        "text": raw[:500],
                        "facility_id": fac_id,
                        "facility_name": fac_name,
                        "field": field_name,
                        "region": region,
                        "city": city,
                        "facility_type": fac_type,
                        "organization_type": org_type,
                        "score": 1.0,
                    })
            else:
                for part in parts:
                    if term_lower in part.lower():
                        results.append({
                            "text": part[:500],
                            "facility_id": fac_id,
                            "facility_name": fac_name,
                            "field": field_name,
                            "region": region,
                            "city": city,
                            "facility_type": fac_type,
                            "organization_type": org_type,
                            "score": 1.0,
                        })
        if len(results) >= top_k:
            break
    return results[:top_k]
