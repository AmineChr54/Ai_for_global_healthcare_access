"""
Lite Healthcare Pipeline — 2 LLM calls instead of 8+.

Architecture:
    Call 1 (analyze_and_query):  Question → SQL queries + search terms   [1 LLM call]
    Execute (no LLM):           SQL + vector search + WHO context        [0-1 embedding]
    Call 2 (synthesize):         All results → answer + citations        [1 LLM call]

Total: 2 LLM calls + 0-1 embedding = ~40-60s on free tier, <5s on paid.

Same interface as graph.py:
    from src.graph_lite import initialize_data, run_query
    initialize_data()
    result = run_query("How many hospitals have cardiology?")
"""

from __future__ import annotations

import csv
import json
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from src.config import DATASET_CSV
from src.data.ghana_context import (
    GHANA_HEALTH_STATS,
    REGION_POPULATION,
    WHO_GUIDELINES,
)
from src.llm import get_llm
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

SQL RULES:
- JSON array columns (specialties, procedure, equipment, capability) are VARCHAR with JSON.
  Use: column ILIKE '%searchterm%' for matching.
- Numeric columns (numberDoctors, capacity) are VARCHAR. Cast: CAST(col AS INTEGER).
  Always filter: WHERE col != 'null' AND col IS NOT NULL
- NULL values: some columns store string 'null'. Always add: AND column != 'null'
- organization_type is 'facility' or 'ngo'.
- facilityTypeId: hospital, pharmacy, doctor, clinic, dentist.
- Use COUNT(DISTINCT pk_unique_id) to avoid duplicate counts.
- Use address_stateOrRegion for region queries, address_city for city queries.

SPECIALTY FILTERING (CRITICAL):
When expanded_terms are provided, use THOSE EXACT terms with specialties ILIKE '%term%'.
Do NOT invent your own search terms.

EXAMPLES:
User: "How many hospitals have cardiology?" (expanded_terms: ["cardiology"])
primary_sql: SELECT COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE specialties ILIKE '%cardiology%' AND facilityTypeId = 'hospital'
detail_sql: SELECT DISTINCT name, address_city, address_stateOrRegion, specialties FROM facilities WHERE specialties ILIKE '%cardiology%' AND facilityTypeId = 'hospital' ORDER BY address_stateOrRegion LIMIT 50
distribution_sql: SELECT address_stateOrRegion AS region, COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE specialties ILIKE '%cardiology%' AND facilityTypeId = 'hospital' GROUP BY address_stateOrRegion ORDER BY count DESC
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


# ── Core pipeline functions ──────────────────────────────────────────────────


def _call1_analyze(question: str, expanded_terms: List[str]) -> AnalysisOutput:
    """Call 1: Generate SQL queries + identify search terms. (1 LLM call)"""
    schema = get_table_schema()
    expanded_str = ", ".join(expanded_terms) if expanded_terms else "none"

    user_prompt = f"""User question: {question}

Expanded medical terms (use these for specialty filtering): [{expanded_str}]

Generate the three SQL queries and optional vector search terms."""

    llm = get_llm()
    structured_llm = llm.with_structured_output(AnalysisOutput)

    result: AnalysisOutput = structured_llm.invoke(
        [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT.format(schema=schema)},
            {"role": "user", "content": user_prompt},
        ]
    )

    logger.info(
        f"Call 1 done | intent={result.intent} | "
        f"vector_terms={result.vector_search_terms} | "
        f"sql_preview={result.primary_sql[:80]}..."
    )
    return result


def _execute_all(analysis: AnalysisOutput) -> Dict[str, Any]:
    """Execute SQL, vector search, and inject WHO context. (0 LLM calls, 0-1 embedding)"""

    # ── Run SQL queries ──────────────────────────────────────────────────
    primary = execute_sql(analysis.primary_sql)
    detail = execute_sql(analysis.detail_sql)
    distribution = execute_sql(analysis.distribution_sql)

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
        "explanation": analysis.explanation,
        "error": primary.get("error"),
    }

    # ── Vector search (if needed) ────────────────────────────────────────
    vector_results: List[Dict[str, Any]] = []
    if analysis.vector_search_terms:
        try:
            from src.tools.vector_search import search as vector_search

            for term in analysis.vector_search_terms[:3]:
                hits = vector_search(term, top_k=10)
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
            logger.info(f"Vector search: {len(vector_results)} unique results")
        except Exception as e:
            logger.warning(f"Vector search skipped: {e}")

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

    result: SynthesisOutput = structured_llm.invoke(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": evidence},
        ]
    )

    logger.info(
        f"Call 2 done | {len(result.response)} chars, "
        f"{len(result.citations)} citations, "
        f"{len(result.facility_names)} facility names"
    )
    return result


# ── Public interface (same as graph.py) ──────────────────────────────────────


def initialize_data() -> None:
    """Initialize DuckDB + FAISS. Call once before processing queries."""
    from src.tools.sql_executor import _get_connection
    from src.tools.vector_search import build_index

    try:
        logger.info("Initializing DuckDB (in-memory)...")
        _get_connection()

        logger.info("Loading facilities for vector index...")
        with open(DATASET_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            facilities = list(reader)
        logger.info(f"   Loaded {len(facilities)} facilities")

        logger.info("Building FAISS vector index...")
        build_index(facilities, force_rebuild=False)

        logger.info("Data initialization complete")
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

    # ── Pre-processing (pure Python, no LLM) ────────────────────────────
    expanded_terms = expand_medical_terms(question)
    if expanded_terms:
        logger.info(f"Expanded terms: {expanded_terms}")

    # ── Call 1: Analyze & generate SQL ───────────────────────────────────
    analysis = _call1_analyze(question, expanded_terms)

    # ── Execute: SQL + vector + context (no LLM) ────────────────────────
    results = _execute_all(analysis)

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
