"""
Layer 3d: External Data Agent

Provides WHO guidelines, population data, disease prevalence, and GDP context
that is NOT in the Ghana facility dataset. This data contextualizes facility
data for questions like "How does specialist ratio compare to WHO guidelines?"

Covers: Q2.2, Q2.4, Q9.1-9.6, Q10.1-10.4
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from src.config import OPENAI_API_KEY, OPENAI_MODEL
from src.state import AgentState

logger = logging.getLogger(__name__)

# ── Reference data (embedded to avoid external API calls during hackathon) ──
GHANA_CONTEXT = {
    "population": {
        "total": 33_475_870,  # 2024 est.
        "urban_pct": 58.7,
        "regions": {
            "Greater Accra": 5_455_000,
            "Ashanti": 5_924_000,
            "Western": 2_060_000,
            "Western North": 850_000,
            "Central": 2_860_000,
            "Eastern": 3_037_000,
            "Volta": 1_907_000,
            "Oti": 760_000,
            "Northern": 2_310_000,
            "Savannah": 590_000,
            "North East": 590_000,
            "Upper East": 1_301_000,
            "Upper West": 901_000,
            "Bono": 1_208_000,
            "Bono East": 1_174_000,
            "Ahafo": 564_000,
        },
    },
    "who_guidelines": {
        "doctors_per_10k": 10.0,  # WHO minimum
        "nurses_per_10k": 25.0,
        "hospital_beds_per_10k": 30.0,
        "surgeons_per_100k": 20.0,  # Lancet Commission
        "ophthalmologists_per_million": 4.0,
        "psychiatrists_per_100k": 1.0,
        "emergency_response_time_min": 30,
        "max_distance_to_hospital_km": 50,
    },
    "ghana_health_stats": {
        "doctors_per_10k": 1.4,  # Ghana actual
        "nurses_per_10k": 14.2,
        "hospital_beds_per_10k": 9.0,
        "life_expectancy": 64.9,
        "gdp_per_capita_usd": 2_363,
        "health_expenditure_pct_gdp": 3.4,
        "top_disease_burden": [
            "malaria",
            "lower respiratory infections",
            "neonatal disorders",
            "HIV/AIDS",
            "stroke",
            "ischemic heart disease",
            "tuberculosis",
            "diarrheal diseases",
            "road injuries",
            "diabetes",
        ],
    },
    "disease_prevalence": {
        "malaria_incidence_per_1000": 166.0,
        "hiv_prevalence_pct": 1.7,
        "tuberculosis_per_100k": 145.0,
        "diabetes_prevalence_pct": 4.2,
        "hypertension_prevalence_pct": 28.7,
        "cataract_blindness_pct_over_50": 1.8,
    },
}

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

    import json

    context_str = json.dumps(GHANA_CONTEXT, indent=2)

    llm = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0)
    structured_llm = llm.with_structured_output(ExternalDataOutput)

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
