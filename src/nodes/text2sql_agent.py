"""
Layer 3a: Text2SQL Agent (Genie)

The workhorse — covers 70%+ of Must-Have questions.
Generates THREE SQL queries for every question:
  1. Primary: answers the question directly (count, aggregation, etc.)
  2. Detail: returns facility names, cities, regions for the same filter
  3. Distribution: regional breakdown (GROUP BY region)

A count alone is NEVER enough — the synthesizer needs names and regions
to produce the impactful, specific answers that win hackathons.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from src.config import OPENAI_API_KEY, OPENAI_MODEL
from src.state import AgentState
from src.tools.sql_executor import execute_sql, get_table_schema

logger = logging.getLogger(__name__)

TEXT2SQL_SYSTEM_PROMPT = """You are a Text-to-SQL agent for a Ghana healthcare facility database (987 rows, 920 facilities, 67 NGOs across 16 regions).

DATABASE SCHEMA:
{schema}

YOUR TASK: Generate THREE SQL queries to fully answer the user's question.
Execute ONLY read queries (SELECT). Never write/update/delete.

THE THREE QUERIES (all three are REQUIRED):

1. **primary_sql** — Directly answers the question (COUNT, aggregation, or filtered list).

2. **detail_sql** — Returns the SPECIFIC facility names, cities, and regions matching the same filter. ALWAYS include: name, address_city, address_stateOrRegion, facilityTypeId, and any other relevant columns. Limit to 50 rows.

3. **distribution_sql** — Regional breakdown: GROUP BY address_stateOrRegion with COUNT. This reveals which regions have coverage and (by omission) which have GAPS.

CRITICAL SQL RULES:
1. JSON array columns (specialties, procedure, equipment, capability) are VARCHAR with JSON arrays.
   - Use: column ILIKE '%searchterm%' for case-insensitive matching (most reliable)

2. Numeric columns (numberDoctors, capacity, area, yearEstablished) are VARCHAR.
   - Cast: CAST(numberDoctors AS INTEGER)
   - Always filter: WHERE numberDoctors != 'null' AND numberDoctors IS NOT NULL

3. NULL handling: some columns store the string 'null' instead of SQL NULL.
   - Always add: AND column != 'null' when filtering

4. Use COUNT(DISTINCT pk_unique_id) to avoid counting duplicate rows.
5. Use address_stateOrRegion for region queries, address_city for city queries.
6. organization_type is 'facility' or 'ngo'.
7. facilityTypeId: hospital, pharmacy, doctor, clinic, dentist.

8. **SPECIALTY FILTERING (MOST IMPORTANT RULE):**
   When the user asks about a specialty, you MUST use the expanded_terms provided.
   - If expanded_terms = ["cardiology"], use: specialties ILIKE '%cardiology%'
   - If expanded_terms = ["ophthalmology"], use: specialties ILIKE '%ophthalmology%'
   - Do NOT invent your own search terms. Do NOT search for procedures, equipment,
     or capabilities unless the user EXPLICITLY asks for them.
   - The specialties column contains values like: ["cardiology","pediatrics","ophthalmology"]
   - A simple ILIKE '%cardiology%' on the specialties column WILL find these.

EXAMPLES OF GOOD QUERY SETS:

User: "How many hospitals have cardiology?"
expanded_terms: ["cardiology"]
primary_sql: SELECT COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE specialties ILIKE '%cardiology%' AND facilityTypeId = 'hospital'
detail_sql: SELECT DISTINCT name, address_city, address_stateOrRegion, specialties FROM facilities WHERE specialties ILIKE '%cardiology%' AND facilityTypeId = 'hospital' ORDER BY address_stateOrRegion, name LIMIT 50
distribution_sql: SELECT address_stateOrRegion AS region, COUNT(DISTINCT pk_unique_id) AS count FROM facilities WHERE specialties ILIKE '%cardiology%' AND facilityTypeId = 'hospital' GROUP BY address_stateOrRegion ORDER BY count DESC

User: "What is the doctor-to-bed ratio by region?"
primary_sql: SELECT address_stateOrRegion AS region, SUM(CAST(numberDoctors AS INTEGER)) AS total_doctors, SUM(CAST(capacity AS INTEGER)) AS total_beds, ROUND(SUM(CAST(numberDoctors AS INTEGER))::FLOAT / NULLIF(SUM(CAST(capacity AS INTEGER)), 0), 3) AS ratio FROM facilities WHERE numberDoctors != 'null' AND capacity != 'null' AND numberDoctors IS NOT NULL AND capacity IS NOT NULL GROUP BY address_stateOrRegion ORDER BY ratio DESC
detail_sql: SELECT name, address_city, address_stateOrRegion, CAST(numberDoctors AS INTEGER) AS doctors, CAST(capacity AS INTEGER) AS beds FROM facilities WHERE numberDoctors != 'null' AND capacity != 'null' AND numberDoctors IS NOT NULL AND capacity IS NOT NULL ORDER BY CAST(capacity AS INTEGER) DESC LIMIT 50
distribution_sql: SELECT address_stateOrRegion AS region, COUNT(DISTINCT pk_unique_id) AS facilities_with_data FROM facilities WHERE numberDoctors != 'null' AND capacity != 'null' GROUP BY address_stateOrRegion ORDER BY facilities_with_data DESC
"""


class SQLTripleOutput(BaseModel):
    primary_sql: str = Field(description="SQL that directly answers the question")
    detail_sql: str = Field(description="SQL returning facility names, cities, regions for the same filter")
    distribution_sql: str = Field(description="SQL with GROUP BY address_stateOrRegion showing regional breakdown")
    explanation: str = Field(description="Brief explanation of the query strategy")


def _execute_with_retry(sql: str, schema: str, llm) -> Dict[str, Any]:
    """Execute SQL, retry once with LLM fix if it fails."""
    result = execute_sql(sql)
    if result["success"]:
        return result

    logger.warning(f"SQL failed: {result['error']}. Attempting fix…")
    fix_prompt = f"""Fix this SQL that failed with: {result['error']}

Original: {sql}

Rules: JSON arrays are VARCHAR (use LIKE), numeric cols are VARCHAR (use CAST), some nulls are string 'null'."""

    from pydantic import BaseModel, Field

    class FixedSQL(BaseModel):
        sql: str = Field(description="The corrected SQL query")

    fixed = llm.with_structured_output(FixedSQL).invoke(
        [
            {"role": "system", "content": f"Fix this SQL for a DuckDB database.\n\nSCHEMA:\n{schema[:2000]}"},
            {"role": "user", "content": fix_prompt},
        ]
    )
    return execute_sql(fixed.sql)


def execute_text2sql(state: AgentState) -> Dict[str, Any]:
    """
    Layer 3a node: generate 3 SQL queries (primary + detail + distribution),
    execute all, and return combined results.

    Reads: state["rewritten_query"], state["query_plan"]
    Writes: state["sql_results"]
    """
    original_query = state.get("query", "")
    rewritten = state.get("rewritten_query", original_query)
    expanded_terms = state.get("expanded_terms", [])
    query_plan = state.get("query_plan", [])

    sql_tasks = [t for t in query_plan if t.get("agent") == "text2sql"]
    task_descriptions = "\n".join(
        f"- {t['description']}" for t in sql_tasks
    ) if sql_tasks else "Answer the user's question directly."

    schema = get_table_schema()

    llm = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0)
    structured_llm = llm.with_structured_output(SQLTripleOutput)

    expanded_str = ", ".join(expanded_terms) if expanded_terms else "none"

    prompt = f"""Original user question: {original_query}
Enhanced question: {rewritten}

Expanded specialty terms to use for filtering: {expanded_str}
IMPORTANT: If expanded_terms are provided, use THOSE EXACT terms with specialties ILIKE '%term%'.
Do NOT substitute your own terms. For example, if expanded_terms = ["cardiology"],
search for specialties ILIKE '%cardiology%', NOT for procedures like "CABG" or "PCI".

Specific tasks:
{task_descriptions}

Generate the three SQL queries (primary, detail, distribution)."""

    result: SQLTripleOutput = structured_llm.invoke(
        [
            {"role": "system", "content": TEXT2SQL_SYSTEM_PROMPT.format(schema=schema)},
            {"role": "user", "content": prompt},
        ]
    )

    logger.info(f"Generated SQL triple:\n  primary: {result.primary_sql[:120]}\n  detail: {result.detail_sql[:120]}\n  distribution: {result.distribution_sql[:120]}")

    # Execute all three queries
    primary_result = _execute_with_retry(result.primary_sql, schema, llm)
    detail_result = _execute_with_retry(result.detail_sql, schema, llm)
    distribution_result = _execute_with_retry(result.distribution_sql, schema, llm)

    return {
        "sql_results": {
            "success": primary_result["success"],
            "primary": {
                "rows": primary_result["rows"][:10],
                "row_count": primary_result["row_count"],
                "sql": primary_result["sql"],
            },
            "detail": {
                "rows": detail_result["rows"][:50],
                "row_count": detail_result["row_count"],
                "sql": detail_result["sql"],
            },
            "distribution": {
                "rows": distribution_result["rows"][:20],
                "row_count": distribution_result["row_count"],
                "sql": distribution_result["sql"],
            },
            "explanation": result.explanation,
            "error": primary_result.get("error"),
        }
    }
