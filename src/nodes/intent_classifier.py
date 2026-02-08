"""
Layer 1: Intent Classifier (Supervisor)

Classifies the user query into one of 11 categories and determines which
downstream agents are required. This is the router — it prevents wasting
compute on agents that aren't needed for simple queries.

LangGraph pattern: conditional edge — output determines which agents activate.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import BaseModel, Field

from src.llm import get_llm
from src.state import AgentState

logger = logging.getLogger(__name__)

# ── Intent → Required Agents routing table ──────────────────────────────────
INTENT_ROUTING = {
    # Every intent now includes external_data for population context —
    # this lets every answer say "Region X (pop. Y) has ZERO facilities"
    "basic_lookup": ["text2sql", "external_data"],
    "geospatial": ["text2sql", "geospatial", "external_data"],
    "validation": ["text2sql", "vector_search", "medical_reasoner", "external_data"],
    "anomaly": ["text2sql", "vector_search", "medical_reasoner", "external_data"],
    "workforce": ["text2sql", "vector_search", "medical_reasoner", "external_data"],
    "service_classification": ["text2sql", "vector_search", "medical_reasoner"],
    "ngo_analysis": ["text2sql", "vector_search", "medical_reasoner", "geospatial", "external_data"],
    "resource_gaps": ["text2sql", "vector_search", "medical_reasoner", "external_data"],
    "unmet_needs": ["text2sql", "geospatial", "medical_reasoner", "external_data"],
    "benchmarking": ["text2sql", "medical_reasoner", "external_data"],
    "data_quality": ["text2sql", "vector_search", "medical_reasoner"],
}

CLASSIFIER_SYSTEM_PROMPT = """You are an intent classifier for a healthcare facility intelligence system analyzing Ghana healthcare data.

Classify the user's question into EXACTLY ONE of these categories:

1. **basic_lookup** — Simple counting, filtering, listing facilities.
   Examples: "How many hospitals have cardiology?", "Which region has the most clinics?"

2. **geospatial** — Questions involving distance, location, proximity, geographic gaps, "medical deserts".
   Examples: "How many hospitals within 50km of Tamale?", "Where are the cold spots for surgery?"

3. **validation** — Verifying facility claims, cross-referencing procedures with equipment.
   Examples: "Which facilities claim cardiology but lack ECG?", "Do equipment lists match claimed services?"

4. **anomaly** — Detecting suspicious patterns, misrepresentation, inconsistent claims.
   Examples: "Which facilities claim 200 procedures but have minimal equipment?", "Unusual bed-to-doctor ratios?"

5. **workforce** — Healthcare worker distribution, specialist availability, staffing patterns.
   Examples: "Where are ophthalmologists practicing?", "Which regions have visiting vs permanent specialists?"

6. **service_classification** — Classifying nature of services (itinerant vs permanent, referral vs direct).
   Examples: "Which facilities mention visiting surgeons?", "Who refers patients vs performs procedures?"

7. **ngo_analysis** — NGO presence, overlap, coordination, gaps in international organization coverage.
   Examples: "Which regions have overlapping NGOs?", "Where are gaps in NGO coverage despite need?"

8. **resource_gaps** — Equipment shortages, infrastructure deficiencies, resource distribution.
   Examples: "Which regions lack equipment for their claimed procedures?", "Where are equipment vs training gaps?"

9. **unmet_needs** — Population-based demand analysis, underserved areas, demographic needs.
   Examples: "Which population centers show unmet surgical need?", "Where does demand exceed capacity?"

10. **benchmarking** — Comparing against WHO guidelines, international standards, cross-regional comparison.
    Examples: "How does specialist ratio compare to WHO guidelines?", "Which facilities are high-impact intervention sites?"

11. **data_quality** — Questions about data freshness, reliability, source corroboration.
    Examples: "How reliable are the facility claims?", "Which claims are corroborated by multiple sources?"

Respond with a JSON object containing:
- "intent": the category name (one of the 11 above)
- "confidence": a float 0-1 indicating classification confidence
- "reasoning": a brief explanation of why this category was chosen
"""


class IntentOutput(BaseModel):
    intent: str = Field(description="One of the 11 intent categories")
    confidence: float = Field(description="Confidence score 0-1")
    reasoning: str = Field(description="Why this category was chosen")


def classify_intent(state: AgentState) -> Dict[str, Any]:
    """
    Layer 1 node: classify the user query and determine required agents.

    Reads: state["query"]
    Writes: state["intent"], state["required_agents"]
    """
    query = state.get("query", "")
    if not query:
        query = state["messages"][-1].content if state.get("messages") else ""

    structured_llm = get_llm().with_structured_output(IntentOutput)

    result: IntentOutput = structured_llm.invoke(
        [
            {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ]
    )

    intent = result.intent
    if intent not in INTENT_ROUTING:
        logger.warning(f"Unknown intent '{intent}', defaulting to basic_lookup")
        intent = "basic_lookup"

    required_agents = INTENT_ROUTING[intent]

    logger.info(f"Intent: {intent} (confidence: {result.confidence:.2f}) → agents: {required_agents}")

    return {
        "intent": intent,
        "required_agents": required_agents,
    }
