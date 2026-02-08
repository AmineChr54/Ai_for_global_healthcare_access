"""
Layer 5: Response Synthesizer

Combines results from ALL agents into a coherent, impact-level response.
Generates row-level citations and formats output for non-technical NGO planners.

Every response MUST include: specific facility names, regional distribution,
gap analysis, population impact, and actionable recommendations.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from pydantic import BaseModel, Field

from src.llm import get_llm
from src.state import AgentState

logger = logging.getLogger(__name__)

SYNTHESIZER_SYSTEM_PROMPT = """You are a response synthesizer for a healthcare intelligence system serving the Virtue Foundation.
Your audience is NGO planners who make resource-allocation decisions that directly affect patient lives.

Your response must be DATA-DRIVEN, SPECIFIC, and IMPACTFUL. Generic advice is useless — names, numbers, and gaps save lives.

MANDATORY RESPONSE STRUCTURE (use these exact headers in markdown):

### Key Finding
1-2 sentences with the core answer. Include the specific number and what it means.

### Facilities
Name EVERY facility from the data with its city and region. Format as a bullet list:
- **[Facility Name]** — [City], [Region] | [key detail like specialty or capacity]
If there are more than 15, list the top 15 and note how many more exist.

### Geographic Distribution
Show which regions HAVE this service/facility AND which regions DO NOT.
- Use the distribution data to create a clear picture of coverage vs gaps.
- Always state: "X of 16 regions have [this]. Y regions have NONE: [list them]."
- If population data is available, include it: "[Region] (pop. X) has zero [service]."

### Critical Gaps
This is the most important section. Identify:
- Which regions/areas are UNSERVED (no facilities for the queried service)
- Population affected by the gap (use external data if available)
- Distance implications (nearest facility for unserved areas)
- What the gap means for patient outcomes (clinical significance)

### Data Quality Note
Briefly note data completeness. For example: "Only X of 987 facilities report [this] — actual numbers may be higher due to under-reporting of facilities without web presence."

### Recommendations
2-3 specific, actionable items tied to the data. NOT generic advice.
BAD: "Consider allocating more resources to underserved areas."
GOOD: "Northern Region (2.3M people, 0 cardiology facilities) should be the top priority for a cardiology outreach program. The nearest facility is Komfo Anokye Teaching Hospital in Kumasi, 400km away."

---

EXAMPLES OF GOOD vs BAD RESPONSES:

BAD RESPONSE:
"12 hospitals offer cardiology services. Consider allocating resources to underserved areas."

GOOD RESPONSE:
"**12 hospitals in Ghana list cardiology**, concentrated in just 4 of 16 regions.

**Facilities:**
- **Korle Bu Teaching Hospital** — Accra, Greater Accra | National Cardiothoracic Centre
- **Komfo Anokye Teaching Hospital** — Kumasi, Ashanti | Cardiac surgery
[...all 12 listed]

**Geographic Distribution:**
- Greater Accra: 6 (50%) | Ashanti: 3 | Western: 2 | Central: 1
- **12 of 16 regions have ZERO cardiology facilities**

**Critical Gap:** Northern Region (2.3M people), Upper East (1.3M), Upper West (900K), and Volta (1.9M) have no cardiology facility. A patient in Tamale must travel 400+ km to Kumasi for cardiac care.

**Data Note:** Only 12 of 987 facilities report cardiology specialties. Some facilities may provide basic cardiac monitoring without it appearing in this dataset.

**Recommendation:** Prioritize Northern Region for a cardiology outreach program — highest population (2.3M) with zero coverage, and furthest from the nearest provider."

---

RULES:
- NEVER give a response without naming specific facilities and regions
- ALWAYS show what's MISSING, not just what exists
- ALWAYS reference the total (e.g., "12 of 987 facilities" or "4 of 16 regions")
- If the data has gaps, say so — but still provide the best analysis possible
- Use bold markdown for key numbers and facility names
- Citations should reference specific facilities by name
- TRUST THE SQL DATA. The numbers from SQL results are the ground truth.
  If the primary query says COUNT = 12, report 12. Do NOT override the count
  with your own interpretation or claim 0 when data shows otherwise.
- The SQL queries searched the actual database. Report what they found.

Respond with:
- "response": the full formatted answer (markdown, using the mandatory sections above)
- "citations": list of citation objects for every facility mentioned
- "confidence_level": high | medium | low
- "limitations": specific data caveats
"""


class Citation(BaseModel):
    facility_id: str = Field(default="", description="Facility pk_unique_id if applicable")
    facility_name: str = Field(default="", description="Facility name")
    data_source: str = Field(description="Which agent: text2sql | vector_search | geospatial | external_data | medical_reasoning")
    evidence: str = Field(description="The specific data point cited")


class SynthesizerOutput(BaseModel):
    response: str = Field(description="Full formatted answer in markdown with mandatory sections")
    citations: List[Citation] = Field(description="Row-level citations for every facility mentioned")
    confidence_level: str = Field(description="high | medium | low")
    limitations: str = Field(description="Specific data caveats")


def synthesize_response(state: AgentState) -> Dict[str, Any]:
    """
    Layer 5 node: combine all results, generate citations, format impact-level answer.

    Reads: everything from layers 1-4
    Writes: state["synthesis"], state["citations"]
    """
    query = state.get("query", "")
    rewritten = state.get("rewritten_query", query)
    intent = state.get("intent", "")

    # Gather all evidence with generous limits so the LLM sees facility names
    sections = [
        f"Original query: {query}",
        f"Enhanced query: {rewritten}",
        f"Intent: {intent}",
    ]

    sql = state.get("sql_results")
    if sql and isinstance(sql, dict):
        # Give the synthesizer the full detail + distribution data
        sections.append(f"## SQL Results\n{json.dumps(sql, indent=2, default=str)[:6000]}")

    if state.get("vector_results"):
        sections.append(f"## Vector Search\n{json.dumps(state['vector_results'], indent=2, default=str)[:3000]}")

    if state.get("geo_results"):
        sections.append(f"## Geospatial Analysis\n{json.dumps(state['geo_results'], indent=2, default=str)[:3000]}")

    if state.get("external_data"):
        sections.append(f"## External Data (WHO, Population, Demographics)\n{json.dumps(state['external_data'], indent=2, default=str)[:2500]}")

    if state.get("medical_analysis"):
        sections.append(f"## Medical Analysis\n{json.dumps(state['medical_analysis'], indent=2, default=str)[:3000]}")

    evidence = "\n\n".join(sections)

    structured_llm = get_llm(temperature=0.2).with_structured_output(SynthesizerOutput)

    result: SynthesizerOutput = structured_llm.invoke(
        [
            {"role": "system", "content": SYNTHESIZER_SYSTEM_PROMPT},
            {"role": "user", "content": evidence},
        ]
    )

    citations = [
        {
            "facility_id": c.facility_id,
            "facility_name": c.facility_name,
            "data_source": c.data_source,
            "evidence": c.evidence,
        }
        for c in result.citations
    ]

    logger.info(
        f"Synthesized response: {len(result.response)} chars, "
        f"{len(citations)} citations, confidence={result.confidence_level}"
    )

    return {
        "synthesis": result.response,
        "citations": citations,
    }
