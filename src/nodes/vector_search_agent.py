"""
Layer 3b: Vector Search Agent

Semantic search over free-form text fields (procedure, equipment, capability).
SQL can't meaningfully search "visiting surgeon performs cataract camp twice yearly" —
you need vector similarity for that.

This directly addresses the IDP Innovation criterion (30% of scoring).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from src.config import TOP_K_VECTOR_RESULTS
from src.state import AgentState
from src.tools.vector_search import search as vector_search

logger = logging.getLogger(__name__)


def execute_vector_search(state: AgentState) -> Dict[str, Any]:
    """
    Layer 3b node: semantic search over free-form fields.

    Reads: state["rewritten_query"], state["query_plan"], state["expanded_terms"]
    Writes: state["vector_results"]
    """
    rewritten = state.get("rewritten_query", state.get("query", ""))
    query_plan = state.get("query_plan", [])
    expanded = state.get("expanded_terms", [])

    # Extract vector-search-specific sub-tasks
    vs_tasks = [t for t in query_plan if t.get("agent") == "vector_search"]
    search_queries = []

    if vs_tasks:
        for task in vs_tasks:
            search_queries.append(task["description"])
    else:
        search_queries.append(rewritten)

    # Also search for expanded medical terms
    if expanded:
        search_queries.append(" ".join(expanded))

    # Execute searches and deduplicate results
    all_results: List[Dict[str, Any]] = []
    seen_texts: set = set()

    for sq in search_queries:
        results = vector_search(query=sq, top_k=TOP_K_VECTOR_RESULTS)
        for r in results:
            text_key = r["text"]
            if text_key not in seen_texts:
                seen_texts.add(text_key)
                all_results.append(r)

    # Sort by score descending
    all_results.sort(key=lambda x: x.get("score", 0), reverse=True)

    # Limit total results
    all_results = all_results[:TOP_K_VECTOR_RESULTS * 2]

    logger.info(
        f"Vector search returned {len(all_results)} unique results "
        f"from {len(search_queries)} queries"
    )

    return {
        "vector_results": {
            "results": all_results,
            "total_matches": len(all_results),
            "search_queries": search_queries,
        }
    }
