"""
API Request / Response Models — Pydantic schemas for the REST API.

Separated from server.py for clarity and reusability.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """Request model for natural language queries."""

    question: str = Field(
        ...,
        description="Natural language question about healthcare facilities",
        examples=["How many hospitals have cardiology?"],
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
        description="Source citations with evidence",
    )
    intent: str = Field(..., description="Classified query intent category")
    required_agents: List[str] = Field(
        default_factory=list,
        description="Agents used in the pipeline",
    )
    iteration: int = Field(..., description="Number of quality gate iterations")
    elapsed: float = Field(..., description="Processing time in seconds")
    sql_results: Optional[Dict[str, Any]] = Field(
        None,
        description="Structured query results",
    )
    expanded_terms: List[str] = Field(
        default_factory=list,
        description="Medical terms expanded from query",
    )
    filters: MapFilters = Field(..., description="Filters for map visualization")
    facility_names: List[str] = Field(
        default_factory=list,
        description="Facility names to highlight on map",
    )
