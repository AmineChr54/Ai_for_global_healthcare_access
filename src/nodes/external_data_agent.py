"""
Layer 3d: External Data Agent

Provides WHO guidelines, population data, disease prevalence, and GDP context
that is NOT in the Ghana facility dataset. This data contextualizes facility
data for questions like "How does specialist ratio compare to WHO guidelines?"

Covers: Q2.2, Q2.4, Q9.1-9.6, Q10.1-10.4
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from pydantic import BaseModel, Field

from src.data.ghana_context import GHANA_CONTEXT, get_full_context
from src.llm import get_llm
from src.state import AgentState

logger = logging.getLogger(__name__)

EXTERNAL_DATA_PROMPT = """You are an external data analyst supporting a Ghana healthcare facility intelligence system.

You have access to the following reference data:
{context}

The user's query requires external context (WHO guidelines, population data, disease prevalence, etc.)
to properly answer their question about Ghana's healthcare infrastructure.

Based on the user's query, extract the most relevant external data points.

Respond with:
- "population_data": list of region population facts relevant to the query (e.g., "Northern Region: 2,310,000")
- "who_benchmarks": list of relevant WHO/international benchmarks (e.g., "WHO minimum: 10 doctors per 10,000 population")
- "ghana_vs_standard": list of comparison statements (e.g., "Ghana has 1.4 doctors per 10k vs WHO minimum of 10")
- "disease_context": relevant disease prevalence data for the query
- "context_notes": interpretive narrative connecting the external data to the query
"""


class ExternalDataOutput(BaseModel):
    population_data: list[str] = Field(description="Region population facts relevant to the query")
    who_benchmarks: list[str] = Field(description="Relevant WHO/international standards")
    ghana_vs_standard: list[str] = Field(description="Ghana vs international benchmark comparisons")
    disease_context: list[str] = Field(description="Relevant disease prevalence data")
    context_notes: str = Field(description="Interpretive narrative")


def execute_external_data(state: AgentState) -> Dict[str, Any]:
    """
    Layer 3d node: fetch WHO guidelines, population, demographics context.

    Reads: state["rewritten_query"]
    Writes: state["external_data"]
    """
    rewritten = state.get("rewritten_query", state.get("query", ""))

    context_str = json.dumps(get_full_context(), indent=2)

    structured_llm = get_llm().with_structured_output(ExternalDataOutput)

    result: ExternalDataOutput = structured_llm.invoke(
        [
            {
                "role": "system",
                "content": EXTERNAL_DATA_PROMPT.format(context=context_str),
            },
            {"role": "user", "content": rewritten},
        ]
    )

    logger.info(
        f"External data: {len(result.population_data)} population facts, "
        f"{len(result.ghana_vs_standard)} comparisons"
    )

    return {
        "external_data": {
            "population_data": result.population_data,
            "who_benchmarks": result.who_benchmarks,
            "ghana_vs_standard": result.ghana_vs_standard,
            "disease_context": result.disease_context,
            "context_notes": result.context_notes,
        }
    }
