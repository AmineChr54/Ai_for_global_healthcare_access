"""
Lite Healthcare Pipeline — 2 LLM calls instead of 8+.

Architecture:
    Call 1 (analyze_and_query):  Question → SQL queries + search terms   [1 LLM call]
    Execute (no LLM, no embeddings):  SQL + SQL free-text search + WHO context on health.db
    Call 2 (synthesize):         All results → answer + citations        [1 LLM call]

Total: 2 LLM calls only. All data from health.db via SQL (no FAISS/embeddings).

Same interface as graph.py:
    from src.graph_lite import initialize_data, run_query
    initialize_data()
    result = run_query("How many hospitals have cardiology?")
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
from src.planning.engine import parse_plan_request, run_plan_query
from src.tools.medical_hierarchy import expand_medical_terms
from src.tools.sql_executor import execute_sql, get_table_schema

logger = logging.getLogger(__name__)


# ── Structured output schemas ────────────────────────────────────────────────


class AnalysisOutput(BaseModel):
    """Call 1 output: SQL queries + search terms."""

    primary_sql: str = Field(
        description="SQL that directly answers the question (COUNT, aggregation, or filtered list)"
    )
    detail_sql: str = Field(
        description="SQL returning facility names, cities, regions matching the same filter (LIMIT 50)"
    )
    distribution_sql: str = Field(
        description="SQL with GROUP BY address_stateOrRegion showing regional breakdown"
    )
    vector_search_terms: List[str] = Field(
        default_factory=list,
        description="1-3 keywords for semantic search over procedure/equipment/capability fields. "
        "Leave empty if SQL alone is sufficient.",
    )
    intent: str = Field(
        description="Query category: basic_lookup | geospatial | validation | anomaly | workforce | comparison"
    )
    explanation: str = Field(
        description="Brief explanation of the query strategy"
    )


class SynthesisCitation(BaseModel):
    facility_name: str = Field(default="", description="Facility name")
    evidence: str = Field(description="The specific data point cited")


class SynthesisOutput(BaseModel):
    """Call 2 output: answer + citations + facility names."""

    response: str = Field(
        description="Full formatted answer in markdown"
    )
    citations: List[SynthesisCitation] = Field(
        default_factory=list,
        description="Row-level citations for facilities mentioned",
    )
    facility_names: List[str] = Field(
        default_factory=list,
        description="All facility names mentioned (for map highlighting)",
    )


# ── Prompts ──────────────────────────────────────────────────────────────────

ANALYSIS_SYSTEM_PROMPT = """You are a healthcare data analyst for a Ghana facility database (987 rows, 920 facilities, 67 NGOs across 16 regions).

DATABASE SCHEMA:
{schema}

YOUR TASK: Generate THREE SQL queries to fully answer the user's question.

THE THREE QUERIES (all three are REQUIRED):
1. **primary_sql** — Directly answers the question (COUNT, aggregation, or filtered list).
2. **detail_sql** — Returns facility names, cities, regions matching the same filter. ALWAYS include: name, address_city, address_stateOrRegion, facilityTypeId, specialties. LIMIT 50.
3. **distribution_sql** — Regional breakdown: GROUP BY address_stateOrRegion with COUNT.

Also provide vector_search_terms if the query involves specific equipment, procedures, or capabilities that are stored as free-text (not in the specialties column). Leave empty for basic specialty/facility lookups.

SQL RULES (SQLite — use LIKE; no ILIKE):
- Text columns (specialties, procedure, equipment, capability) are TEXT. Use: column LIKE '%searchterm%' for matching.
  For case-insensitive: LOWER(column) LIKE LOWER('%searchterm%').
- Numeric columns (numberDoctors, capacity) are VARCHAR. Cast: CAST(col AS INTEGER).
  Always filter: WHERE col != 'null' AND col IS NOT NULL
- NULL values: some columns store string 'null'. Always add: AND column != 'null'
- organization_type is 'facility' or 'ngo'.
- facilityTypeId: hospital, pharmacy, doctor, clinic, dentist.
- Use COUNT(DISTINCT pk_unique_id) to avoid duplicate counts.
- Use address_stateOrRegion for region queries, address_city for city queries.

SPECIALTY FILTERING (CRITICAL — READ CAREFULLY):
When expanded_terms are provided, you MUST use ONLY those exact terms for matching.
Do NOT use the user's original words (e.g. "pediatric care", "heart surgery") in LIKE patterns.
Instead, use the expanded_terms values (e.g. "pediatrics", "cardiacSurgery").

The expanded_terms are the canonical column values that ACTUALLY EXIST in the data.
The user's natural language terms (like "pediatric care") do NOT exist in the data and will return 0 rows.

MATCHING ACROSS MULTIPLE COLUMNS (SQLite: use LIKE, or LOWER(col) LIKE LOWER('%T%') for case-insensitive):
For each expanded term, search across specialties, procedure, capability, AND equipment columns.
This is critical because a facility might list a service in capability/procedure but not in specialties.

RULE: For EACH expanded term T, create a combined condition:
  (specialties LIKE '%'||T||'%' OR procedure LIKE '%'||T||'%' OR capability LIKE '%'||T||'%' OR equipment LIKE '%'||T||'%')
  or use LOWER(column) LIKE LOWER('%'||T||'%'). In SQLite string concat is ||.
If multiple expanded terms, combine the per-term conditions with OR inside parentheses.

EXAMPLES:
User: "How many hospitals have cardiology?" (expanded_terms: ["cardiology"])
primary_sql: SELECT COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE (specialties ILIKE '%cardiology%' OR procedure ILIKE '%cardiology%' OR capability ILIKE '%cardiology%') AND facilityTypeId = 'hospital'
detail_sql: SELECT DISTINCT name, address_city, address_stateOrRegion, specialties, facilityTypeId FROM facilities WHERE (specialties ILIKE '%cardiology%' OR procedure ILIKE '%cardiology%' OR capability ILIKE '%cardiology%') AND facilityTypeId = 'hospital' ORDER BY address_stateOrRegion LIMIT 50
distribution_sql: SELECT address_stateOrRegion AS region, COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE (specialties ILIKE '%cardiology%' OR procedure ILIKE '%cardiology%' OR capability ILIKE '%cardiology%') AND facilityTypeId = 'hospital' GROUP BY address_stateOrRegion ORDER BY count DESC

User: "Show facilities offering pediatric care in Ashanti" (expanded_terms: ["pediatrics"])
primary_sql: SELECT COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE (specialties ILIKE '%pediatrics%' OR procedure ILIKE '%pediatrics%' OR capability ILIKE '%pediatrics%') AND address_stateOrRegion ILIKE '%Ashanti%'
  NOTE: Uses "pediatrics" (from expanded_terms), NOT "pediatric care" (from user query).
detail_sql: SELECT DISTINCT name, address_city, address_stateOrRegion, specialties, facilityTypeId FROM facilities WHERE (specialties ILIKE '%pediatrics%' OR procedure ILIKE '%pediatrics%' OR capability ILIKE '%pediatrics%') AND address_stateOrRegion ILIKE '%Ashanti%' ORDER BY name LIMIT 50
distribution_sql: SELECT address_stateOrRegion AS region, COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE (specialties ILIKE '%pediatrics%' OR procedure ILIKE '%pediatrics%' OR capability ILIKE '%pediatrics%') GROUP BY address_stateOrRegion ORDER BY count DESC
"""

SYNTHESIS_SYSTEM_PROMPT = """You are a healthcare intelligence analyst for the Virtue Foundation.
Your audience is NGO planners who make resource-allocation decisions affecting patient lives.

Your response must be DATA-DRIVEN, SPECIFIC, and IMPACTFUL.

RESPONSE STRUCTURE (use these headers):

### Key Finding
1-2 sentences with the core answer. Include specific numbers.

### Facilities
Name facilities from the data with city and region as a bullet list:
- **[Name]** — [City], [Region] | [key detail]
List up to 15. If more exist, note the total.

### Geographic Distribution
Show which regions HAVE this service AND which DO NOT.
State: "X of 16 regions have [this]. Y regions have NONE: [list them]."

### Critical Gaps
- Which regions are UNSERVED
- Population affected (use the WHO/population data provided)
- What the gap means for patients

### Recommendations
2-3 specific, actionable items tied to the data.
BAD: "Consider allocating more resources."
GOOD: "Northern Region (2.3M people, 0 cardiology) should be the top priority."

RULES:
- ALWAYS name specific facilities and regions
- ALWAYS show what's MISSING, not just what exists
- Reference totals (e.g., "12 of 987 facilities" or "4 of 16 regions")
- TRUST THE SQL DATA — report the numbers as-is
- If anomalies exist (e.g., facility claims surgery but has no equipment), flag them
- Use bold markdown for key numbers and names

GHANA HEALTH CONTEXT:
- Population: {total_pop:,}
- Doctors per 10k: {docs_per_10k} (WHO minimum: {who_docs})
- Hospital beds per 10k: {beds_per_10k} (WHO minimum: {who_beds})

REGION POPULATIONS:
{region_pop}
"""


# ── Resilient LLM caller ─────────────────────────────────────────────────────


def _invoke_with_retry(structured_llm, messages, *, max_attempts: int = 5):
    """
    Invoke an LLM with our own rate-limit retry logic.

    The OpenAI client's built-in retries use short exponential backoff (0.5s,
    1s, 2s...) which actually makes 429 cascading WORSE on a 3 RPM free tier
    because each retry counts as a request.  We override with longer waits
    (25-60s) so the RPM window genuinely clears between attempts.
    """
    for attempt in range(max_attempts):
        try:
            return structured_llm.invoke(messages)
        except Exception as e:
            err = str(e).lower()
            is_rate_limit = "429" in str(e) or "rate" in err or "rate_limit" in err
            if is_rate_limit and attempt < max_attempts - 1:
                wait = 25 + attempt * 15          # 25s, 40s, 55s, 70s
                logger.warning(
                    f"Rate-limited (attempt {attempt + 1}/{max_attempts}). "
                    f"Waiting {wait}s for RPM window to clear..."
                )
                _time.sleep(wait)
            else:
                raise


# ── Core pipeline functions ──────────────────────────────────────────────────


def _build_multi_column_condition(terms: List[str]) -> str:
    """
    Build a SQL condition that searches for expanded terms across
    specialties, procedure, capability, and equipment columns.
    """
    per_term = []
    for t in terms:
        cols = [
            f"specialties ILIKE '%{t}%'",
            f"procedure ILIKE '%{t}%'",
            f"capability ILIKE '%{t}%'",
            f"equipment ILIKE '%{t}%'",
        ]
        per_term.append("(" + " OR ".join(cols) + ")")

    if len(per_term) == 1:
        return per_term[0]
    return "(" + " OR ".join(per_term) + ")"


def _validate_and_fix_sql(
    analysis: AnalysisOutput, expanded_terms: List[str]
) -> AnalysisOutput:
    """
    Post-validation: ensure generated SQL uses expanded_terms instead of
    the user's raw natural-language phrases.

    A common LLM failure mode is to use the user's words (e.g. "pediatric care")
    in ILIKE patterns instead of the canonical expanded term ("pediatrics").
    This function detects and fixes that.

    Also ensures multi-column search (specialties + procedure + capability + equipment).
    """
    if not expanded_terms:
        return analysis

    import re as _re

    def _fix_sql(sql: str) -> str:
        sql_lower = sql.lower()
        # Check if ANY expanded term appears in the SQL (case-insensitive)
        has_expanded = any(t.lower() in sql_lower for t in expanded_terms)

        if has_expanded:
            # Even if expanded terms are present, ensure multi-column search.
            # Replace single-column patterns like "specialties ILIKE '%term%'"
            # with multi-column patterns.
            for t in expanded_terms:
                single_col_pattern = _re.compile(
                    rf"specialties\s+ILIKE\s+'%{_re.escape(t)}%'",
                    _re.IGNORECASE,
                )
                if single_col_pattern.search(sql):
                    multi_col = (
                        f"(specialties ILIKE '%{t}%' OR procedure ILIKE '%{t}%' "
                        f"OR capability ILIKE '%{t}%' OR equipment ILIKE '%{t}%')"
                    )
                    sql = single_col_pattern.sub(multi_col, sql)
                    logger.info(f"SQL fix: expanded single-column to multi-column search for '{t}'")
            return sql

        # SQL doesn't use any expanded term — inject multi-column condition.
        multi_col_condition = _build_multi_column_condition(expanded_terms)

        # Try to find and replace the bad ILIKE pattern.
        bad_pattern = _re.compile(
            r"specialties\s+ILIKE\s+'%[^']+%'", _re.IGNORECASE
        )
        match = bad_pattern.search(sql)
        if match:
            fixed = bad_pattern.sub(multi_col_condition, sql, count=1)
            logger.warning(
                f"SQL fix: replaced '{match.group()}' → multi-column condition"
            )
            return fixed

        # Check for bad patterns in procedure/capability/equipment columns too
        for col in ["procedure", "capability", "equipment"]:
            bad_col_pattern = _re.compile(
                rf"{col}\s+ILIKE\s+'%[^']+%'", _re.IGNORECASE
            )
            match = bad_col_pattern.search(sql)
            if match:
                fixed = bad_col_pattern.sub(multi_col_condition, sql, count=1)
                logger.warning(
                    f"SQL fix: replaced '{match.group()}' → multi-column condition"
                )
                return fixed

        # If no ILIKE pattern found at all, add the condition to WHERE clause
        if "WHERE" in sql.upper():
            fixed = _re.sub(
                r"(WHERE\s+)",
                rf"\1{multi_col_condition} AND ",
                sql,
                count=1,
                flags=_re.IGNORECASE,
            )
            logger.warning(f"SQL fix: injected multi-column condition into WHERE clause")
            return fixed

        return sql

    analysis.primary_sql = _fix_sql(analysis.primary_sql)
    analysis.detail_sql = _fix_sql(analysis.detail_sql)
    analysis.distribution_sql = _fix_sql(analysis.distribution_sql)
    return analysis


def _call1_analyze(question: str, expanded_terms: List[str]) -> AnalysisOutput:
    """Call 1: Generate SQL queries + identify search terms. (1 LLM call)"""
    schema = get_table_schema()
    expanded_str = ", ".join(expanded_terms) if expanded_terms else "none"

    user_prompt = f"""User question: {question}

Expanded medical terms (use these for specialty filtering): [{expanded_str}]
IMPORTANT: Use ONLY the expanded terms above in ILIKE patterns, NOT the user's raw words.
For example, use '%pediatrics%' not '%pediatric care%'.

Generate the three SQL queries and optional vector search terms."""

    llm = get_llm()
    structured_llm = llm.with_structured_output(AnalysisOutput)

    result: AnalysisOutput = _invoke_with_retry(
        structured_llm,
        [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT.format(schema=schema)},
            {"role": "user", "content": user_prompt},
        ],
    )

    # Post-validate: ensure expanded terms are actually used in SQL
    result = _validate_and_fix_sql(result, expanded_terms)

    logger.info(
        f"Call 1 done | intent={result.intent} | "
        f"vector_terms={result.vector_search_terms} | "
        f"sql_preview={result.primary_sql[:80]}..."
    )
    return result


def _build_fallback_queries(
    expanded_terms: List[str], original_question: str
) -> Optional[Dict[str, str]]:
    """
    Build reliable fallback SQL queries directly from expanded terms.

    This bypasses LLM-generated SQL entirely, using a simple template
    that we KNOW matches the data format.
    """
    if not expanded_terms:
        return None

    multi_col_condition = _build_multi_column_condition(expanded_terms)

    # Extract facility type from the question
    q = original_question.lower()
    type_filter = ""
    for ftype in ["hospital", "clinic", "pharmacy", "doctor", "dentist"]:
        if ftype in q:
            type_filter = f" AND facilityTypeId = '{ftype}'"
            break

    # Extract region from the question
    region_filter = ""
    regions = [
        "Greater Accra", "Ashanti", "Western", "Central", "Eastern",
        "Volta", "Northern", "Upper East", "Upper West", "Bono",
        "Bono East", "Ahafo", "Oti", "Savannah", "Western North", "North East",
    ]
    for region in regions:
        if region.lower() in q:
            region_filter = f" AND (address_stateOrRegion ILIKE '%{region}%')"
            break

    base_where = f"WHERE {multi_col_condition}{type_filter}{region_filter}"

    return {
        "primary": (
            f"SELECT COUNT(DISTINCT pk_unique_id) AS count FROM facilities {base_where}"
        ),
        "detail": (
            f"SELECT DISTINCT name, address_city, address_stateOrRegion, "
            f"specialties, facilityTypeId FROM facilities {base_where} "
            f"ORDER BY address_stateOrRegion LIMIT 50"
        ),
        "distribution": (
            f"SELECT address_stateOrRegion AS region, COUNT(DISTINCT pk_unique_id) AS count "
            f"FROM facilities {base_where} "
            f"GROUP BY address_stateOrRegion ORDER BY count DESC"
        ),
    }


def _execute_all(
    analysis: AnalysisOutput,
    expanded_terms: Optional[List[str]] = None,
    original_question: str = "",
) -> Dict[str, Any]:
    """Execute SQL, SQL free-text search, and inject WHO context. (0 LLM calls, 0 embeddings)

    If the LLM-generated primary SQL returns 0 rows but expanded_terms are available,
    automatically falls back to a reliable direct query.
    """

    # ── Run SQL queries ──────────────────────────────────────────────────
    primary = execute_sql(analysis.primary_sql)
    detail = execute_sql(analysis.detail_sql)
    distribution = execute_sql(analysis.distribution_sql)

    # ── Fallback: if LLM SQL returned 0 rows, try direct query ───────────
    used_fallback = False
    if expanded_terms and primary["success"]:
        # Check if primary returned a count of 0
        primary_count = 0
        if primary["rows"]:
            first_row = primary["rows"][0]
            for val in first_row.values():
                try:
                    primary_count = int(val)
                    break
                except (ValueError, TypeError):
                    pass

        if primary_count == 0 and detail["row_count"] == 0:
            logger.warning(
                "LLM-generated SQL returned 0 results despite having expanded terms. "
                "Running fallback queries..."
            )
            fallback = _build_fallback_queries(expanded_terms, original_question)
            if fallback:
                fb_primary = execute_sql(fallback["primary"])
                fb_detail = execute_sql(fallback["detail"])
                fb_distribution = execute_sql(fallback["distribution"])

                # Check if fallback found results
                fb_count = 0
                if fb_primary["rows"]:
                    for val in fb_primary["rows"][0].values():
                        try:
                            fb_count = int(val)
                            break
                        except (ValueError, TypeError):
                            pass

                if fb_count > 0:
                    logger.info(
                        f"Fallback query found {fb_count} results! "
                        f"Using fallback results instead."
                    )
                    primary = fb_primary
                    detail = fb_detail
                    distribution = fb_distribution
                    used_fallback = True

    sql_results = {
        "success": primary["success"],
        "primary": {
            "rows": primary["rows"][:10],
            "row_count": primary["row_count"],
            "sql": primary["sql"],
        },
        "detail": {
            "rows": detail["rows"][:50],
            "row_count": detail["row_count"],
            "sql": detail["sql"],
        },
        "distribution": {
            "rows": distribution["rows"][:20],
            "row_count": distribution["row_count"],
            "sql": distribution["sql"],
        },
        "explanation": analysis.explanation + (" [fallback query used]" if used_fallback else ""),
        "error": primary.get("error"),
    }

    # ── Free-text search via SQL (no embeddings; uses health.db only) ──────
    vector_results: List[Dict[str, Any]] = []
    if analysis.vector_search_terms:
        try:
            from src.tools.sql_executor import search_free_text

            for term in analysis.vector_search_terms[:3]:
                hits = search_free_text(term, top_k=10)
                vector_results.extend(hits)
            # Deduplicate by text
            seen = set()
            unique = []
            for hit in vector_results:
                key = hit.get("text", "")
                if key not in seen:
                    seen.add(key)
                    unique.append(hit)
            vector_results = unique[:15]
            logger.info(f"Free-text SQL search: {len(vector_results)} unique results")
        except Exception as e:
            logger.warning(f"Free-text search skipped: {e}")

    # ── WHO / population context (no LLM call) ──────────────────────────
    external_context = {
        "region_population": REGION_POPULATION,
        "who_guidelines": WHO_GUIDELINES,
        "ghana_health_stats": GHANA_HEALTH_STATS,
    }

    return {
        "sql_results": sql_results,
        "vector_results": vector_results,
        "external_context": external_context,
    }


def _call2_synthesize(
    question: str,
    expanded_terms: List[str],
    intent: str,
    sql_results: Dict[str, Any],
    vector_results: List[Dict[str, Any]],
) -> SynthesisOutput:
    """Call 2: Generate the final answer from all results. (1 LLM call)"""

    # Build the evidence payload
    sections = [f"User question: {question}"]

    if expanded_terms:
        sections.append(f"Medical terms: {', '.join(expanded_terms)}")

    sections.append(f"## SQL Results\n{json.dumps(sql_results, indent=2, default=str)[:6000]}")

    if vector_results:
        sections.append(
            f"## Semantic Search Results (equipment/procedures/capabilities)\n"
            f"{json.dumps(vector_results[:10], indent=2, default=str)[:3000]}"
        )

    evidence = "\n\n".join(sections)

    # Format the system prompt with WHO data
    region_pop_lines = "\n".join(
        f"- {r}: {p:,}" for r, p in REGION_POPULATION.items()
    )

    system = SYNTHESIS_SYSTEM_PROMPT.format(
        total_pop=GHANA_HEALTH_STATS.get("total_population", 30_832_019),
        docs_per_10k=GHANA_HEALTH_STATS.get("doctors_per_10k", 1.4),
        who_docs=WHO_GUIDELINES.get("doctors_per_10k", 10.0),
        beds_per_10k=GHANA_HEALTH_STATS.get("hospital_beds_per_10k", 6.0),
        who_beds=WHO_GUIDELINES.get("hospital_beds_per_10k", 18.0),
        region_pop=region_pop_lines,
    )

    llm = get_llm(temperature=0.2)
    structured_llm = llm.with_structured_output(SynthesisOutput)

    result: SynthesisOutput = _invoke_with_retry(
        structured_llm,
        [
            {"role": "system", "content": system},
            {"role": "user", "content": evidence},
        ],
    )

    logger.info(
        f"Call 2 done | {len(result.response)} chars, "
        f"{len(result.citations)} citations, "
        f"{len(result.facility_names)} facility names"
    )
    return result


# ── Public interface (same as graph.py) ──────────────────────────────────────


def initialize_data() -> None:
    """Initialize SQLite (facilities VIEW) only. No FAISS, no embedding API calls — all search via SQL on health.db."""
    from src.tools.sql_executor import _get_connection, execute_sql

    try:
        logger.info("Initializing database (SQLite facilities VIEW)...")
        _get_connection()
        result = execute_sql("SELECT COUNT(*) AS n FROM facilities")
        if result["success"] and result["rows"]:
            n = result["rows"][0].get("n", 0)
            logger.info(f"   facilities VIEW: {n} rows")
        logger.info("Data initialization complete (SQL-only, no embeddings)")
    except Exception as e:
        logger.error(f"Data initialization failed: {e}")
        raise


def run_query(question: str) -> Dict[str, Any]:
    """
    Execute a question through the 2-call pipeline.

    Returns a dict compatible with the API server's QueryResponse model:
        synthesis, citations, intent, required_agents, iteration,
        sql_results, expanded_terms, facility_names
    """
    logger.info(f"[lite] Processing: {question}")

    # ── Check for planning/deployment intent (0 LLM calls) ──────────────
    plan_params = parse_plan_request(question)
    if plan_params:
        logger.info("[lite] Routing to planning engine")
        return run_plan_query(question, plan_params)

    # ── Pre-processing (pure Python, no LLM) ────────────────────────────
    expanded_terms = expand_medical_terms(question)
    if expanded_terms:
        logger.info(f"Expanded terms: {expanded_terms}")

    # ── Call 1: Analyze & generate SQL ───────────────────────────────────
    analysis = _call1_analyze(question, expanded_terms)

    # ── Execute: SQL + vector + context (no LLM) ────────────────────────
    results = _execute_all(analysis, expanded_terms=expanded_terms, original_question=question)

    # ── Call 2: Synthesize answer ────────────────────────────────────────
    synthesis = _call2_synthesize(
        question=question,
        expanded_terms=expanded_terms,
        intent=analysis.intent,
        sql_results=results["sql_results"],
        vector_results=results["vector_results"],
    )

    # ── Extract facility names for map highlighting ──────────────────────
    facility_names = list(synthesis.facility_names)

    # Also pull names from SQL detail results as fallback
    detail_rows = results["sql_results"].get("detail", {}).get("rows", [])
    for row in detail_rows:
        name = row.get("name") or row.get("NAME")
        if name and name not in facility_names:
            facility_names.append(name)

    # ── Build response (matches graph.py output contract) ────────────────
    return {
        "synthesis": synthesis.response,
        "citations": [
            {
                "facility_name": c.facility_name,
                "data_source": "text2sql",
                "evidence": c.evidence,
            }
            for c in synthesis.citations
        ],
        "intent": analysis.intent,
        "required_agents": ["text2sql"]
        + (["vector_search"] if analysis.vector_search_terms else []),
        "iteration": 1,
        "expanded_terms": expanded_terms,
        "sql_results": results["sql_results"],
        "facility_names": facility_names,
    }
