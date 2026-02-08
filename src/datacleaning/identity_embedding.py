"""Identity text and embeddings for duplicate detection."""

from typing import List

from .config import EMBEDDING_DIM, EMBEDDING_MODEL, OPENAI_API_KEY
from .models import ScrapedRow

# In-memory cache to avoid re-calling the API for the same identity text (saves requests).
_embed_cache: dict[str, List[float]] = {}
_EMBED_CACHE_MAX = 2000


def _embed_cache_evict() -> None:
    if len(_embed_cache) < _EMBED_CACHE_MAX:
        return
    keys = list(_embed_cache.keys())
    for k in keys[: _EMBED_CACHE_MAX // 2]:
        _embed_cache.pop(k, None)


def build_identity_text(row: ScrapedRow) -> str:
    """Build a stable identity string from name + address + phone + website for embedding.
    Used to find possible duplicates: similar identity text => same org candidate.
    """
    parts: List[str] = []
    if row.name:
        parts.append(row.name.strip())
    if row.address_city:
        parts.append(row.address_city.strip())
    if row.address_line1:
        parts.append(row.address_line1.strip())
    if row.address_country or row.address_country_code:
        parts.append((row.address_country or row.address_country_code or "").strip())
    # Primary contact: first phone or official website
    if row.phone_numbers:
        parts.append(row.phone_numbers[0].strip())
    elif row.official_website:
        parts.append(row.official_website.strip())
    elif row.websites:
        parts.append(row.websites[0].strip())
    return " | ".join(p for p in parts if p)


def build_identity_text_from_org(org: dict) -> str:
    """Build identity string from a DB organization dict (same format as row identity for comparable embeddings)."""
    parts: List[str] = []
    if org.get("canonical_name"):
        parts.append(str(org["canonical_name"]).strip())
    if org.get("address_city"):
        parts.append(str(org["address_city"]).strip())
    if org.get("address_line1"):
        parts.append(str(org["address_line1"]).strip())
    if org.get("address_country"):
        parts.append(str(org["address_country"]).strip())
    elif org.get("address_country_code"):
        parts.append(str(org["address_country_code"]).strip())
    return " | ".join(p for p in parts if p)


def embed_identity(text: str) -> List[float]:
    """Compute embedding for identity text. Uses OpenAI; results are cached by text to save API calls."""
    key = text or " "
    if key in _embed_cache:
        return _embed_cache[key]
    try:
        from openai import OpenAI
        kwargs = {"api_key": OPENAI_API_KEY} if OPENAI_API_KEY else {}
        client = OpenAI(**kwargs)
        r = client.embeddings.create(model=EMBEDDING_MODEL, input=key)
        emb = r.data[0].embedding
        _embed_cache_evict()
        _embed_cache[key] = emb
        return emb
    except Exception as e:
        raise RuntimeError(f"Embedding failed: {e}") from e


def embed_identity_batch(texts: List[str], *, batch_size: int = 100) -> List[List[float]]:
    """Compute embeddings for multiple texts in batch (fewer API requests). Returns list of embeddings in same order."""
    if not texts:
        return []
    out: List[List[float]] = []
    try:
        from openai import OpenAI
        kwargs = {"api_key": OPENAI_API_KEY} if OPENAI_API_KEY else {}
        client = OpenAI(**kwargs)
        for i in range(0, len(texts), batch_size):
            chunk = [t or " " for t in texts[i : i + batch_size]]
            r = client.embeddings.create(model=EMBEDDING_MODEL, input=chunk)
            # Response order matches input order
            for item in r.data:
                out.append(item.embedding)
        return out
    except Exception as e:
        raise RuntimeError(f"Batch embedding failed: {e}") from e


def embed_row_identity(row: ScrapedRow) -> List[float]:
    """Build identity text from row and return its embedding."""
    identity = build_identity_text(row)
    return embed_identity(identity)
