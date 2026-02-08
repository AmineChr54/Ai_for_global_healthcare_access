"""Configuration and constants. Works locally (.env / os.getenv) and on Databricks (secrets)."""

import os
from pathlib import Path


def _get(key: str, default: str | None = None) -> str | None:
    """Read config: Databricks secrets first (if available), then os.environ. No .env in Databricks."""
    # Databricks: secrets live in secret scopes; job/cluster can pass scope name via env
    secret_scope = os.getenv("DATABRICKS_SECRET_SCOPE")
    if secret_scope:
        try:
            from dbutils import secrets  # noqa: F401
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
        root = Path(__file__).resolve().parent.parent.parent
        env_file = root / ".env"
        if env_file.exists():
            load_dotenv(env_file, override=True)
    except ImportError:
        pass


_load_dotenv_local()

# Paths (same locally and on Databricks; override via env if needed). We live in src/datacleaning/ so project root is parent.parent.parent.
PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent.parent)))
DATA_DIR = PROJECT_ROOT / "data"
SCHEMA_DIR = PROJECT_ROOT / "schema"
DEFAULT_CSV = DATA_DIR / "Virtue Foundation Ghana v0.3 - Sheet1.csv"

# DB (use _get so Databricks can inject via secrets). Default SQLite for local.
DATABASE_URL = _get("DATABASE_URL") or os.getenv("DATABASE_URL", "sqlite:///health.db")

# Embedding (identity dedup + append-to-DB)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))
# Only send close matches to the agent (cosine similarity >= threshold, max N candidates)
EMBEDDING_SIMILARITY_THRESHOLD = float(os.getenv("EMBEDDING_SIMILARITY_THRESHOLD", "0.78"))
MAX_CANDIDATES_FOR_AGENT = int(os.getenv("MAX_CANDIDATES_FOR_AGENT", "5"))

# LLM for merge/same-or-new agent (secret)
OPENAI_API_KEY = _get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# Idempotency
PROCESSED_ROWS_TABLE = "processed_rows"

# Geocoding: fill lat/lon from address via Nominatim (1 req/s). Off by default.
GEOCODE_ENABLED = os.getenv("GEOCODE_ENABLED", "").strip().lower() in ("1", "true", "yes")
