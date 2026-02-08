"""
Shared AgentState — the single TypedDict flowing through the entire LangGraph pipeline.

Every node reads from and writes to this state. LangGraph manages passage between nodes.
"""

from typing import Annotated, Any, Dict, List, Optional, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    ── Conversation ──────────────────────────────────────────────────────
    messages          Conversation history (managed by LangGraph add_messages)
    query             Original user query (set once at start)

    ── Layer 1: Intent Classifier ────────────────────────────────────────
    intent            Category: basic_lookup | geospatial | validation | anomaly |
                      workforce | ngo_analysis | unmet_needs | resource_gaps |
                      service_classification | benchmarking | data_quality
    required_agents   Agent names to invoke: text2sql | vector_search |
                      geospatial | external_data

    ── Layer 2: Query Planner & Medical Rewriter ─────────────────────────
    query_plan        Decomposed atomic sub-tasks
    rewritten_query   Medically-enhanced user query
    expanded_terms    Canonical specialty names expanded from user terms

    ── Layer 3: Retrieval Agents (parallel fan-out) ──────────────────────
    sql_results       Rows / aggregates from Text2SQL
    vector_results    Semantic matches from free-form fields
    geo_results       Distance / cold-spot calculations
    external_data     WHO guidelines, population, demographics

    ── Layer 4: Medical Reasoning ────────────────────────────────────────
    medical_analysis  Validated analysis with anomaly flags & clinical context

    ── Layer 5: Response Synthesizer ─────────────────────────────────────
    synthesis         Final human-readable answer
    citations         Row-level citations [{facility_id, field, evidence}, ...]

    ── Layer 6: Quality Gate ─────────────────────────────────────────────
    needs_refinement  True if response needs another pass
    refinement_feedback  What specifically to improve
    iteration         Loop counter (capped at MAX_QUALITY_ITERATIONS)
    """

    # Conversation
    messages: Annotated[list, add_messages]
    query: str

    # Layer 1
    intent: str
    required_agents: List[str]

    # Layer 2
    query_plan: List[Dict[str, Any]]
    rewritten_query: str
    expanded_terms: List[str]

    # Layer 3
    sql_results: Optional[List[Dict[str, Any]]]
    vector_results: Optional[List[Dict[str, Any]]]
    geo_results: Optional[List[Dict[str, Any]]]
    external_data: Optional[Dict[str, Any]]

    # Layer 4
    medical_analysis: Optional[Dict[str, Any]]

    # Layer 5
    synthesis: str
    citations: List[Dict[str, Any]]

    # Layer 6
    needs_refinement: bool
    refinement_feedback: str
    iteration: int
