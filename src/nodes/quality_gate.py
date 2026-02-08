"""
Layer 6: Quality Gate (Feedback Loop)

Evaluates whether the synthesized response meets concrete quality criteria.
Uses a specific checklist rather than vague "is it good?" evaluation.

LangGraph pattern: conditional edge with cycle back to query_planner.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from src.config import MAX_QUALITY_ITERATIONS, OPENAI_API_KEY, OPENAI_MODEL
from src.state import AgentState

logger = logging.getLogger(__name__)

QUALITY_GATE_PROMPT = """You are a quality evaluator for a healthcare intelligence system.

The user asked: "{query}"

The system generated this response:
---
{response}
---

Score the response on these SPECIFIC criteria (1 point each, max 7):

1. NAMES FACILITIES: Does the response name at least 3 specific facilities with their cities/regions? (If fewer than 3 exist in the data, naming all of them counts.)
2. SHOWS DISTRIBUTION: Does it show which regions HAVE the queried service and how many?
3. IDENTIFIES GAPS: Does it explicitly state which regions or areas LACK the queried service?
4. USES NUMBERS: Does it include specific counts, percentages, or ratios (not vague words like "many" or "some")?
5. POPULATION CONTEXT: Does it reference population sizes or WHO benchmarks for at least one region?
6. DATA TRANSPARENCY: Does it acknowledge data limitations or coverage (e.g., "X of 987 facilities report...")?
7. ACTIONABLE: Does it end with at least 1 specific recommendation tied to a named region or facility?

A score of 5+ means the response is adequate.
A score below 5 means it needs refinement — specify exactly what's missing.

Respond with:
- "criteria_met": list of which criteria (1-7) are satisfied
- "criteria_missed": list of which criteria are NOT satisfied
- "quality_score": total points (0-7)
- "is_complete": true if score >= 5
- "refinement_guidance": if not complete, specific instructions for improvement (focus on the missed criteria)
"""


class QualityOutput(BaseModel):
    criteria_met: list[int] = Field(description="Which criteria numbers (1-7) are met")
    criteria_missed: list[int] = Field(description="Which criteria numbers are NOT met")
    quality_score: int = Field(description="Total score 0-7")
    is_complete: bool = Field(description="True if score >= 5")
    refinement_guidance: str = Field(description="What to improve if not complete")


def check_quality(state: AgentState) -> Dict[str, Any]:
    """
    Layer 6 node: evaluate response against concrete checklist.

    Reads: state["query"], state["synthesis"], state["iteration"]
    Writes: state["needs_refinement"], state["refinement_feedback"], state["iteration"]
    """
    query = state.get("query", "")
    synthesis = state.get("synthesis", "")
    iteration = state.get("iteration", 0)

    # Hard cap on iterations to prevent infinite loops
    if iteration >= MAX_QUALITY_ITERATIONS - 1:
        logger.info(f"Max iterations ({MAX_QUALITY_ITERATIONS}) reached. Accepting response.")
        return {
            "needs_refinement": False,
            "refinement_feedback": "",
            "iteration": iteration + 1,
        }

    llm = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0)
    structured_llm = llm.with_structured_output(QualityOutput)

    result: QualityOutput = structured_llm.invoke(
        [
            {
                "role": "system",
                "content": QUALITY_GATE_PROMPT.format(query=query, response=synthesis),
            },
            {"role": "user", "content": "Evaluate the response against the 7 criteria."},
        ]
    )

    needs_refinement = not result.is_complete and result.quality_score < 5

    logger.info(
        f"Quality gate: score={result.quality_score}/7, "
        f"met={result.criteria_met}, missed={result.criteria_missed}, "
        f"needs_refinement={needs_refinement}, iteration={iteration + 1}"
    )

    return {
        "needs_refinement": needs_refinement,
        "refinement_feedback": result.refinement_guidance if needs_refinement else "",
        "iteration": iteration + 1,
    }
