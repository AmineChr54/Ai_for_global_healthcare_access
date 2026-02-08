"""
VF Healthcare Agent API Server

FastAPI REST API that exposes the LangGraph healthcare intelligence pipeline
to the Next.js frontend. Handles natural language queries and returns structured
responses with facility data for map visualization.

Run:
    uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

# Ensure project root is on sys.path
PROJECT_ROOT = str(Path(__file__).parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from api.schemas import MapFilters, QueryRequest, QueryResponse
from src.graph_lite import initialize_data, run_query

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifecycle ───────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the data layer on startup, clean up on shutdown."""
    logger.info("🚀 Starting VF Healthcare Agent API")
    logger.info("Initializing data layer (SQLite + FAISS)...")
    try:
        initialize_data()
        logger.info("✅ Data layer ready")
    except Exception as e:
        logger.error(f"❌ Failed to initialize data layer: {e}")
        raise
    yield
    # Nothing to tear down (in-memory DuckDB + FAISS are garbage-collected)


app = FastAPI(
    title="VF Healthcare Agent API",
    description="AI-powered healthcare intelligence system for global healthcare access",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict to frontend origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helper Functions ────────────────────────────────────────────────────────


def _extract_filters(question: str, result: Dict[str, Any]) -> MapFilters:
    """
    Extract map visualization filters from query and pipeline results.

    Analyzes the user's natural language question and expanded medical terms
    to determine which facilities should be highlighted on the map.
    """
    q = question.lower()

    # Detect facility types mentioned in the query
    facility_type_patterns = ["hospital", "clinic", "doctor", "pharmacy", "dentist"]
    detected_types = [
        ft for ft in facility_type_patterns if re.search(rf"\b{ft}s?\b", q)
    ]

    # Extract specialty from expanded medical terms
    expanded_terms = result.get("expanded_terms", [])
    specialty = None

    direct_matches = [term for term in expanded_terms if term.lower() in q]
    if len(direct_matches) == 1:
        specialty = direct_matches[0]
    elif len(direct_matches) > 1:
        specialty = max(direct_matches, key=len)  # most specific
    elif expanded_terms:
        specialty = expanded_terms[0]  # user used informal language

    return MapFilters(specialty=specialty, types=detected_types)


def _extract_facility_names(result: Dict[str, Any]) -> List[str]:
    """Extract facility names from SQL query results for map highlighting."""
    facility_names: List[str] = []
    sql_results = result.get("sql_results")

    if sql_results and isinstance(sql_results, dict):
        detail = sql_results.get("detail", {})
        if isinstance(detail, dict):
            for row in detail.get("rows", []):
                name = row.get("name") or row.get("NAME")
                if name:
                    facility_names.append(name)

    return facility_names


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, str]:
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "healthy", "service": "vf-healthcare-agent"}


@app.post("/api/query", response_model=QueryResponse, status_code=status.HTTP_200_OK)
async def process_query(req: QueryRequest) -> QueryResponse:
    """
    Process a natural language healthcare query through the lite 2-call pipeline.

    The synchronous `run_query` is dispatched to a thread pool so it does NOT
    block the async event loop.
    """
    logger.info(f"📝 Processing query: {req.question}")
    start_time = time.time()

    try:
        result = await asyncio.to_thread(run_query, req.question)
        elapsed = time.time() - start_time

        # graph_lite returns facility_names directly; fall back to SQL extraction
        facility_names = result.get("facility_names") or _extract_facility_names(result)
        filters = _extract_filters(req.question, result)

        logger.info(
            f"✅ Query completed in {elapsed:.2f}s | "
            f"Intent: {result.get('intent', 'unknown')} | "
            f"Agents: {', '.join(result.get('required_agents', []))}"
        )

        return QueryResponse(
            synthesis=result.get("synthesis", ""),
            citations=result.get("citations", []),
            intent=result.get("intent", ""),
            required_agents=result.get("required_agents", []),
            iteration=result.get("iteration", 1),
            elapsed=round(elapsed, 2),
            sql_results=result.get("sql_results"),
            expanded_terms=result.get("expanded_terms", []),
            filters=filters,
            facility_names=facility_names,
        )

    except HTTPException:
        raise  # Re-raise FastAPI exceptions as-is

    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e)
        logger.error(f"❌ Query failed after {elapsed:.2f}s: {error_msg}", exc_info=True)

        # Detect rate-limit errors and return a friendlier message
        if "429" in error_msg or "rate_limit" in error_msg.lower() or "rate limit" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="OpenAI rate limit reached. Please wait 20-30 seconds and try again.",
            )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query processing failed: {error_msg}",
        )
