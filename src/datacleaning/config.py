"""Datacleaning config: re-exports shared config from src.config and adds ingestion-specific settings."""

import os

from src.config import (
    DATABASE_URL,
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    PROJECT_ROOT,
)

# Re-export so existing "from .config import DATABASE_URL" etc. keep working
__all__ = [
    "DATABASE_URL",
    "DEFAULT_CSV",
    "EMBEDDING_DIM",
    "EMBEDDING_MODEL",
    "EMBEDDING_SIMILARITY_THRESHOLD",
    "GEOCODE_ENABLED",
    "LLM_MODEL",
    "MAX_CANDIDATES_FOR_AGENT",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "PROCESSED_ROWS_TABLE",
    "PROJECT_ROOT",
    "SCHEMA_DIR",
]

# ── Paths ───────────────────────────────────────────────────────────────────
DATA_DIR = PROJECT_ROOT / "data"
SCHEMA_DIR = PROJECT_ROOT / "schema"
DEFAULT_CSV = DATA_DIR / "Virtue Foundation Ghana v0.3 - Sheet1.csv"

# ── Embedding (identity dedup + append-to-DB) ────────────────────────────────
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))
EMBEDDING_SIMILARITY_THRESHOLD = float(os.getenv("EMBEDDING_SIMILARITY_THRESHOLD", "0.78"))
MAX_CANDIDATES_FOR_AGENT = int(os.getenv("MAX_CANDIDATES_FOR_AGENT", "5"))

# ── LLM (same as OPENAI_MODEL; alias for merge/same-or-new agent) ────────────
LLM_MODEL = os.getenv("LLM_MODEL", OPENAI_MODEL)

# ── Idempotency ─────────────────────────────────────────────────────────────
PROCESSED_ROWS_TABLE = "processed_rows"

# ── Geocoding: fill lat/lon from address via Nominatim (1 req/s). Off by default.
GEOCODE_ENABLED = os.getenv("GEOCODE_ENABLED", "").strip().lower() in ("1", "true", "yes")
