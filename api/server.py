"""
VF Healthcare Agent API Server

FastAPI REST API that exposes the LangGraph healthcare intelligence pipeline
to the Next.js frontend. Handles natural language queries and returns structured
responses with facility data for map visualization.

Run:
    uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
    
Environment Variables:
    OPENAI_API_KEY: Required for LLM operations
    OPENAI_MODEL: Model to use (default: gpt-4o)
    DATABASE_URL: Optional PostgreSQL connection string
"""

from __future__ import annotations

import logging
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure project root is on sys.path
PROJECT_ROOT = str(Path(__file__).parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.graph import initialize_data, run_query

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="VF Healthcare Agent API",
    description="AI-powered healthcare intelligence system for global healthcare access",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: In production, restrict to frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response Models ─────────────────────────────────────────────────


class QueryRequest(BaseModel):
    """Request model for natural language queries."""
    
    question: str = Field(
        ...,
        description="Natural language question about healthcare facilities",
        examples=["How many hospitals have cardiology?"]
    )


class MapFilters(BaseModel):
    """Map visualization filters extracted from query."""
    
    specialty: Optional[str] = Field(None, description="Medical specialty to filter by")
    types: List[str] = Field(default_factory=list, description="Facility types to show")


class QueryResponse(BaseModel):
    """Response model containing analysis results and metadata."""
    
    synthesis: str = Field(..., description="Natural language answer to the query")
    citations: List[Dict[str, Any]] = Field(
        default_factory=list, 
        description="Source citations with evidence"
    )
    intent: str = Field(..., description="Classified query intent category")
    required_agents: List[str] = Field(
        default_factory=list, 
        description="Agents used in the pipeline"
    )
    iteration: int = Field(..., description="Number of quality gate iterations")
    elapsed: float = Field(..., description="Processing time in seconds")
    sql_results: Optional[Dict[str, Any]] = Field(
        None, 
        description="Structured query results"
    )
    expanded_terms: List[str] = Field(
        default_factory=list, 
        description="Medical terms expanded from query"
    )
    filters: MapFilters = Field(..., description="Filters for map visualization")
    facility_names: List[str] = Field(
        default_factory=list, 
        description="Facility names to highlight on map"
    )


# ── Helper Functions ────────────────────────────────────────────────────────


def _extract_filters(question: str, result: Dict[str, Any]) -> MapFilters:
    """
    Extract map visualization filters from query and pipeline results.
    
    Analyzes the user's natural language question and expanded medical terms
    to determine which facilities should be highlighted on the map.
    
    Args:
        question: Original user query in natural language
        result: Pipeline execution results containing expanded terms
        
    Returns:
        MapFilters object with specialty and facility type filters
    """
    q = question.lower()

    # Extract facility types from query
    facility_type_patterns = ["hospital", "clinic", "doctor", "pharmacy", "dentist"]
    detected_types = []
    for facility_type in facility_type_patterns:
        if re.search(rf"\b{facility_type}s?\b", q):
            detected_types.append(facility_type)

    # Extract specialty from expanded medical terms
    expanded_terms = result.get("expanded_terms", [])
    specialty = None
    
    # 1. Direct match: expanded term appears in question
    direct_matches = [term for term in expanded_terms if term.lower() in q]
    
    if len(direct_matches) == 1:
        specialty = direct_matches[0]
    elif len(direct_matches) > 1:
        # Pick the most specific (longest) match
        specialty = max(direct_matches, key=len)
    elif expanded_terms:
        # User used informal language (e.g., "heart" → "cardiology")
        # Use the first expanded term as the filter
        specialty = expanded_terms[0]

    return MapFilters(specialty=specialty, types=detected_types)


# ── Lifecycle Events ────────────────────────────────────────────────────────


@app.on_event("startup")
async def startup_event() -> None:
    """
    Initialize the data layer on application startup.
    
    Loads the dataset into DuckDB and builds the FAISS vector index.
    This is idempotent and safe to call multiple times.
    """
    logger.info("🚀 Starting VF Healthcare Agent API")
    logger.info("Initializing data layer (DuckDB + FAISS)...")
    try:
        initialize_data()
        logger.info("✅ Data layer ready")
    except Exception as e:
        logger.error(f"❌ Failed to initialize data layer: {e}")
        raise


# ── API Endpoints ───────────────────────────────────────────────────────────


@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint for monitoring and load balancers.
    
    Returns:
        Simple status indicator
    """
    return {"status": "healthy", "service": "vf-healthcare-agent"}


@app.post("/api/query", response_model=QueryResponse, status_code=status.HTTP_200_OK)
async def process_query(req: QueryRequest) -> QueryResponse:
    """
    Process a natural language healthcare query through the LangGraph pipeline.
    
    This endpoint orchestrates a 6-layer AI pipeline:
    1. Intent Classification - categorizes the question
    2. Query Planning - expands medical terms and decomposes tasks
    3. Parallel Retrieval - executes Text2SQL, Vector Search, Geospatial, External Data
    4. Medical Reasoning - validates results and detects anomalies
    5. Synthesis - generates human-readable answer with citations
    6. Quality Gate - ensures completeness and may trigger refinement
    
    Args:
        req: QueryRequest containing the natural language question
        
    Returns:
        QueryResponse with answer, citations, metadata, and map filters
        
    Raises:
        HTTPException: If query processing fails
    """
    logger.info(f"📝 Processing query: {req.question}")

    start_time = time.time()
    
    try:
        # Run the LangGraph pipeline
        result = run_query(req.question)
        elapsed = time.time() - start_time
        
        # Extract facility names from SQL results for map highlighting
        facility_names = _extract_facility_names(result)
        
        # Extract map filters from query and results
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
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"❌ Query failed after {elapsed:.2f}s: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query processing failed: {str(e)}"
        )


def _extract_facility_names(result: Dict[str, Any]) -> List[str]:
    """
    Extract facility names from SQL query results.
    
    Args:
        result: Pipeline execution results
        
    Returns:
        List of facility names to highlight on the map
    """
    facility_names = []
    sql_results = result.get("sql_results")
    
    if sql_results and isinstance(sql_results, dict):
        detail = sql_results.get("detail", {})
        if isinstance(detail, dict):
            for row in detail.get("rows", []):
                name = row.get("name") or row.get("NAME")
                if name:
                    facility_names.append(name)
    
    return facility_names
