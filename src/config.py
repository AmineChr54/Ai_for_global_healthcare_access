"""
Configuration — loads environment variables and provides centralized settings.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# ── Paths ───────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# ── OpenAI ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# ── Vector Store ────────────────────────────────────────────────────────────
FAISS_INDEX_PATH: Path = PROJECT_ROOT / "data" / "vector_store"

# ── Dataset ─────────────────────────────────────────────────────────────────
DATASET_CSV: Path = (
    PROJECT_ROOT / "ghana_dataset" / "Virtue Foundation Ghana v0.3 - Sheet1.csv"
)

# ── Pipeline Tuning ─────────────────────────────────────────────────────────
MAX_QUALITY_ITERATIONS: int = 3
EMBEDDING_DIMENSION: int = 1536  # text-embedding-3-small
TOP_K_VECTOR_RESULTS: int = 15
