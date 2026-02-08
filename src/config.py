"""
Unified configuration: .env locally, Databricks secrets in production.

- Local: set DATABASE_URL and OPENAI_API_KEY in .env (python-dotenv loads it).
- Databricks: set DATABRICKS_SECRET_SCOPE; store OPENAI_API_KEY and DATABASE_URL
  in that secret scope. .env is not loaded when DATABRICKS_SECRET_SCOPE is set.
"""

import os
from pathlib import Path


def _get(key: str, default: str | None = None) -> str | None:
    """Read config: Databricks secrets first (if scope set), then os.environ."""
    secret_scope = os.getenv("DATABRICKS_SECRET_SCOPE")
    if secret_scope:
        try:
            from dbutils import secrets  # type: ignore
            return secrets.get(scope=secret_scope, key=key)
        except Exception:
            pass
    return os.getenv(key, default)


def _load_dotenv_local() -> None:
    """Load .env only when running locally (no DATABRICKS_SECRET_SCOPE)."""
    if os.getenv("DATABRICKS_SECRET_SCOPE"):
        return
    try:
        from dotenv import load_dotenv
        root = Path(__file__).resolve().parent.parent
        env_file = root / ".env"
        if env_file.exists():
            load_dotenv(env_file, override=True)
    except ImportError:
        pass


_load_dotenv_local()

# ── Paths ───────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))

# ── Database (portable: .env or Databricks secret) ───────────────────────────
DATABASE_URL: str = (
    _get("DATABASE_URL") or os.getenv("DATABASE_URL", "sqlite:///ghana_dataset/health.db") or ""
)
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///ghana_dataset/health.db"

# ── OpenAI (portable: .env or Databricks secret) ─────────────────────────────
OPENAI_API_KEY: str = (_get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# ── Vector store ────────────────────────────────────────────────────────────
FAISS_INDEX_PATH: Path = PROJECT_ROOT / "data" / "vector_store"

# ── Dataset ─────────────────────────────────────────────────────────────────
DATASET_CSV: Path = (
    PROJECT_ROOT / "ghana_dataset" / "Virtue Foundation Ghana v0.3 - Sheet1.csv"
)

# ── Pipeline tuning ─────────────────────────────────────────────────────────
MAX_QUALITY_ITERATIONS: int = 3
EMBEDDING_DIMENSION: int = 1536  # text-embedding-3-small
TOP_K_VECTOR_RESULTS: int = 15
