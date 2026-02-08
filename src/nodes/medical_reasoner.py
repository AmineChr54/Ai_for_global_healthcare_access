"""
Layer 4: Medical Reasoning Agent

The domain expert. Takes raw results from ALL retrieval agents and:
1. Validates claims — cross-references procedures vs equipment
2. Detects anomalies — flags suspicious patterns (200 procedures but 5 beds)
3. Infers missing info — reasons about capability implications
4. Adds medical context — explains clinical significance

This is the MOST IMPORTANT node: 38 of 59 questions require it.

Two modes:
- FULL reasoning: when medical_reasoner is in required_agents (validation, anomaly, etc.)
- LIGHTWEIGHT reasoning: for basic_lookup/geospatial — adds data-quality context
  and clinical significance without heavy cross-validation
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from pydantic import BaseModel, Field

from src.llm import get_llm
from src.state import AgentState

logger = logging.getLogger(__name__)

# ── Full reasoning prompt (for validation, anomaly, workforce, etc.) ────────
FULL_REASONING_PROMPT = """You are a senior medical analyst with expertise in healthcare facility assessment,
particularly in low- and middle-income countries (LMICs) like Ghana.

You receive raw data from multiple retrieval agents and must perform MEDICAL REASONING:

1. **VALIDATE CLAIMS**: Cross-reference procedures against equipment.
   - A facility claiming "cardiac surgery" MUST have: operating room, cardiac monitor, ventilator, bypass machine
   - A facility claiming "cataract surgery" SHOULD have: operating microscope, phacoemulsification unit OR extracapsular equipment
   - A facility claiming "MRI services" MUST have: MRI scanner listed in equipment
   - Flag any facility where claimed procedures lack supporting equipment evidence

2. **DETECT ANOMALIES**: Flag suspicious patterns.
   - High procedure count + minimal equipment = suspicious
   - Very large bed count + minimal surgical equipment = suspicious
   - Highly specialized claims + small facility size = suspicious
   - Doctor-to-bed ratios outside normal ranges (1:5 to 1:20 is typical)
   - Many specialties claimed by a small clinic

3. **INFER CAPABILITIES**: Read between the lines.
   - "Visiting surgeon" or "camp" language → itinerant/temporary service
   - "We refer patients" or "we collaborate with" → referral, not direct service
   - Named individual surgeon → service fragility (depends on one person)
   - Specific equipment models mentioned → higher credibility
   - Multiple independent source mentions → more reliable

4. **ADD CLINICAL CONTEXT**: Explain significance for patient outcomes.
   - Why a gap matters (e.g., no emergency obstetric care within 100km = maternal mortality risk)
   - What equipment absence implies for patient safety
   - How staffing patterns affect care continuity
   - Reference Ghana-specific disease burden where relevant (malaria, maternal mortality, etc.)

IMPORTANT: Always name specific facilities when flagging anomalies or findings.

Respond with:
- "validated_findings": list of verified facts with confidence levels
- "anomalies_detected": list of suspicious patterns with severity
- "inferred_capabilities": list of inferred capabilities
- "clinical_context": narrative about medical significance and patient impact
- "data_quality_notes": observations about data reliability and coverage
"""

# ── Lightweight reasoning prompt (for basic_lookup, geospatial) ─────────────
LIGHTWEIGHT_REASONING_PROMPT = """You are a medical data analyst reviewing query results from a Ghana healthcare facility database (987 facilities total, 16 regions).

Your task is to add brief but critical context that turns raw data into actionable intelligence:

1. **DATA QUALITY**: Is the result count suspiciously low? For example, if only 12 of 987 facilities report cardiology, note that this likely reflects under-reporting (facilities without web presence may offer basic services).

2. **CLINICAL SIGNIFICANCE**: In 1-2 sentences, explain what this finding means for patient outcomes. For example, if a region has zero ophthalmology facilities, mention that untreated cataracts are the leading cause of preventable blindness in West Africa.

3. **GHANA CONTEXT**: Add relevant Ghana-specific health context:
   - Ghana has 1.4 doctors per 10,000 people (WHO recommends 10)
   - Top disease burden: malaria, lower respiratory infections, neonatal disorders, HIV/AIDS, stroke
   - Maternal mortality ratio: 308 per 100,000 live births
   - Only 60% of population lives within 5km of a health facility
   - Northern regions are consistently underserved compared to Greater Accra and Ashanti

Be concise. Do NOT repeat the raw data. Only add context that isn't obvious from the numbers alone.

Respond with:
- "clinical_context": 2-4 sentences about medical significance
- "data_quality_notes": 1-2 sentences about data reliability/coverage
"""


class Finding(BaseModel):
    statement: str = Field(description="The finding")
    confidence: str = Field(description="high | medium | low")
    evidence: str = Field(description="What data supports this")


class Anomaly(BaseModel):
    description: str = Field(description="What's suspicious")
    severity: str = Field(description="low | medium | high | critical")
    facilities: List[str] = Field(default_factory=list, description="Affected facility names")
    reasoning: str = Field(description="Why this is flagged")


class FullReasoningOutput(BaseModel):
    validated_findings: List[Finding] = Field(description="Verified facts")
    anomalies_detected: List[Anomaly] = Field(description="Suspicious patterns")
    inferred_capabilities: List[str] = Field(description="Inferred capabilities")
    clinical_context: str = Field(description="Medical significance narrative")
    data_quality_notes: str = Field(description="Data reliability observations")


class LightweightReasoningOutput(BaseModel):
    clinical_context: str = Field(description="2-4 sentences on medical significance")
    data_quality_notes: str = Field(description="1-2 sentences on data reliability")


def medical_reasoning(state: AgentState) -> Dict[str, Any]:
    """
    Layer 4 node: validate, cross-reference, detect anomalies, add context.

    Two modes:
    - FULL: when medical_reasoner is in required_agents
    - LIGHTWEIGHT: for all other intents (adds clinical context + data quality notes)

    Reads: state["sql_results"], state["vector_results"], state["geo_results"],
           state["external_data"], state["rewritten_query"], state["required_agents"]
    Writes: state["medical_analysis"]
    """
    rewritten = state.get("rewritten_query", state.get("query", ""))
    required_agents = state.get("required_agents", [])
    is_full = "medical_reasoner" in required_agents

    # Gather evidence
    evidence_parts = []
    sql = state.get("sql_results")
    if sql:
        evidence_parts.append(f"## SQL Results\n{json.dumps(sql, indent=2, default=str)[:4000]}")

    vector = state.get("vector_results")
    if vector:
        evidence_parts.append(f"## Vector Search Results\n{json.dumps(vector, indent=2, default=str)[:3000]}")

    geo = state.get("geo_results")
    if geo:
        evidence_parts.append(f"## Geospatial Analysis\n{json.dumps(geo, indent=2, default=str)[:2000]}")

    ext = state.get("external_data")
    if ext:
        evidence_parts.append(f"## External Data\n{json.dumps(ext, indent=2, default=str)[:2000]}")

    evidence = "\n\n".join(evidence_parts) if evidence_parts else "No retrieval data available."

    if is_full:
        # ── Full medical reasoning ──────────────────────────────────────
        logger.info("Running FULL medical reasoning")
        structured_llm = get_llm(temperature=0.1).with_structured_output(FullReasoningOutput)

        result: FullReasoningOutput = structured_llm.invoke(
            [
                {"role": "system", "content": FULL_REASONING_PROMPT},
                {"role": "user", "content": f"Query: {rewritten}\n\n--- EVIDENCE ---\n{evidence}"},
            ]
        )

        logger.info(
            f"Full reasoning: {len(result.validated_findings)} findings, "
            f"{len(result.anomalies_detected)} anomalies"
        )

        return {
            "medical_analysis": {
                "validated_findings": [
                    {"statement": f.statement, "confidence": f.confidence, "evidence": f.evidence}
                    for f in result.validated_findings
                ],
                "anomalies_detected": [
                    {"description": a.description, "severity": a.severity,
                     "facilities": a.facilities, "reasoning": a.reasoning}
                    for a in result.anomalies_detected
                ],
                "inferred_capabilities": result.inferred_capabilities,
                "clinical_context": result.clinical_context,
                "data_quality_notes": result.data_quality_notes,
            }
        }
    else:
        # ── Lightweight reasoning (basic_lookup, geospatial, etc.) ──────
        logger.info("Running LIGHTWEIGHT medical reasoning (context + data quality)")
        structured_llm = get_llm(temperature=0.1).with_structured_output(LightweightReasoningOutput)

        result: LightweightReasoningOutput = structured_llm.invoke(
            [
                {"role": "system", "content": LIGHTWEIGHT_REASONING_PROMPT},
                {"role": "user", "content": f"Query: {rewritten}\n\n--- DATA ---\n{evidence[:3000]}"},
            ]
        )

        logger.info("Lightweight reasoning complete")

        return {
            "medical_analysis": {
                "validated_findings": [],
                "anomalies_detected": [],
                "inferred_capabilities": [],
                "clinical_context": result.clinical_context,
                "data_quality_notes": result.data_quality_notes,
            }
        }
