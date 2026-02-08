"""
Layer 2: Query Planner & Medical Rewriter

Two critical functions:
1. Decomposes complex queries into atomic sub-tasks
2. Rewrites the query with medical domain knowledge (expands user terms
   to formal taxonomy using the medical hierarchy)

This MUST happen before retrieval — term expansion after retrieval means
missed results. "eye surgery" would miss rows tagged "ophthalmology".
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from src.config import OPENAI_API_KEY, OPENAI_MODEL
from src.state import AgentState
from src.tools.medical_hierarchy import expand_medical_terms, get_all_specialties

logger = logging.getLogger(__name__)

PLANNER_SYSTEM_PROMPT = """You are a medical query planner for a healthcare facility intelligence system.
You operate on Ghana healthcare facility data with 987 records (920 facilities, 67 NGOs).

Your job is to:
1. DECOMPOSE the user's question into atomic sub-tasks that retrieval agents can execute independently.
2. REWRITE the query with medical domain knowledge — but ONLY expand VAGUE or INFORMAL terms.

AVAILABLE MEDICAL SPECIALTIES IN THE DATASET:
{specialties}

CRITICAL REWRITING RULES:
- **DO NOT expand specialty names that already match the dataset taxonomy.**
  If the user says "cardiology", "ophthalmology", "pediatrics", "neurology", etc.,
  those are EXACT specialty names in the database. Keep them AS IS.
  WRONG: "cardiology" → "cardiac catheterization, CABG, PCI, valve replacement"
  RIGHT: "cardiology" → "cardiology"
- **ONLY expand VAGUE or INFORMAL terms** to their formal equivalents:
  * "heart surgery" → "cardiac surgery, cardiothoracic surgery" (vague → specific)
  * "eye surgery" → "ophthalmology" (informal → formal)
  * "stomach doctor" → "gastroenterology" (informal → formal)
- The rewritten query should stay CLOSE to the original. Do NOT add procedures,
  equipment, or capabilities that the user did not ask about.
- If the query is already specific (uses dataset specialty names), the rewritten
  query should be nearly identical to the original.

GENERAL RULES:
- Each sub-task should be executable by ONE agent (text2sql, vector_search, geospatial, or external_data)
- If the query is already specific and simple, keep 1 sub-task and a minimal rewrite

Respond with JSON:
- "sub_tasks": list of objects, each with:
    - "task_id": sequential number
    - "description": what to do
    - "agent": which agent handles it (text2sql | vector_search | geospatial | external_data)
    - "depends_on": list of task_ids this depends on (empty if independent)
- "rewritten_query": the medically-enhanced version of the user query
"""


class SubTask(BaseModel):
    task_id: int = Field(description="Sequential task number")
    description: str = Field(description="What this sub-task does")
    agent: str = Field(description="Which agent: text2sql | vector_search | geospatial | external_data")
    depends_on: List[int] = Field(default_factory=list, description="Task IDs this depends on")


class PlannerOutput(BaseModel):
    sub_tasks: List[SubTask] = Field(description="Decomposed atomic sub-tasks")
    rewritten_query: str = Field(description="Medically-enhanced query")


def plan_query(state: AgentState) -> Dict[str, Any]:
    """
    Layer 2 node: decompose complex queries and add medical context.

    Reads: state["query"], state["intent"], state["refinement_feedback"]
    Writes: state["query_plan"], state["rewritten_query"], state["expanded_terms"]
    """
    query = state.get("query", "")
    intent = state.get("intent", "basic_lookup")
    iteration = state.get("iteration", 0)
    feedback = state.get("refinement_feedback", "")

    # If this is a refinement loop, incorporate feedback
    context = query
    if iteration > 0 and feedback:
        context = f"Original query: {query}\n\nPrevious attempt feedback: {feedback}\n\nPlease address the gaps identified above."

    # Expand medical terms from the query
    expanded = expand_medical_terms(query)

    specialties_str = ", ".join(get_all_specialties())

    llm = ChatOpenAI(
        model=OPENAI_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )

    structured_llm = llm.with_structured_output(PlannerOutput)

    result: PlannerOutput = structured_llm.invoke(
        [
            {
                "role": "system",
                "content": PLANNER_SYSTEM_PROMPT.format(specialties=specialties_str),
            },
            {"role": "user", "content": context},
        ]
    )

    query_plan = [
        {
            "task_id": t.task_id,
            "description": t.description,
            "agent": t.agent,
            "depends_on": t.depends_on,
        }
        for t in result.sub_tasks
    ]

    logger.info(f"Query plan: {len(query_plan)} sub-tasks, rewritten: {result.rewritten_query[:100]}…")

    return {
        "query_plan": query_plan,
        "rewritten_query": result.rewritten_query,
        "expanded_terms": expanded,
    }
