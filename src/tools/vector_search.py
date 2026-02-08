"""
Vector Search — FAISS index over free-form fields (procedure, equipment, capability).

Each declarative fact from these JSON-array columns becomes one vector.
Metadata links every vector back to its source facility for citations.
"""

from __future__ import annotations

import json
import logging
import os
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional

import faiss
import numpy as np
from openai import OpenAI

from src.config import (
    EMBEDDING_DIMENSION,
    EMBEDDING_MODEL,
    FAISS_INDEX_PATH,
    OPENAI_API_KEY,
    TOP_K_VECTOR_RESULTS,
)

logger = logging.getLogger(__name__)

# ── Module-level singletons ─────────────────────────────────────────────────
_client: Optional[OpenAI] = None
_index: Optional[faiss.IndexFlatIP] = None
_metadata: List[Dict[str, Any]] = []


def _get_openai() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def _embed_texts(texts: List[str]) -> np.ndarray:
    """Embed a batch of texts using OpenAI embeddings API with rate-limit handling."""
    import time as _time

    client = _get_openai()
    all_embeddings = []
    batch_size = 256  # smaller batches to reduce chance of 429s
    total_batches = (len(texts) + batch_size - 1) // batch_size

    for batch_idx, i in enumerate(range(0, len(texts), batch_size)):
        batch = texts[i : i + batch_size]
        logger.info(
            f"Embedding batch {batch_idx + 1}/{total_batches} ({len(batch)} texts) …"
        )

        # Retry loop with exponential backoff for rate limits
        for attempt in range(10):
            try:
                response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
                batch_embs = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embs)
                break
            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "rate" in err_str.lower():
                    wait = min(2 ** attempt * 5, 60)
                    logger.warning(
                        f"Embedding rate limited, retrying in {wait}s (attempt {attempt + 1}/10)"
                    )
                    _time.sleep(wait)
                else:
                    raise
        else:
            raise RuntimeError(
                f"Failed to embed batch {batch_idx + 1} after 10 retries"
            )

        # Small pause between batches to stay under RPM
        if batch_idx < total_batches - 1:
            _time.sleep(2)

    arr = np.array(all_embeddings, dtype=np.float32)
    # Normalize for cosine similarity via inner product
    faiss.normalize_L2(arr)
    return arr


def build_index(facilities: List[Dict[str, Any]], force_rebuild: bool = False) -> None:
    """
    Build the FAISS index from facility free-form fields.

    Each fact in procedure/equipment/capability becomes one vector with metadata:
      {facility_id, facility_name, field, text, region, city, facility_type}
    """
    global _index, _metadata

    index_file = FAISS_INDEX_PATH / "index.faiss"
    meta_file = FAISS_INDEX_PATH / "metadata.pkl"

    # Load from disk if already built
    if not force_rebuild and index_file.exists() and meta_file.exists():
        logger.info("Loading existing FAISS index from disk …")
        _index = faiss.read_index(str(index_file))
        with open(meta_file, "rb") as f:
            _metadata = pickle.load(f)
        logger.info(f"Loaded index with {_index.ntotal} vectors.")
        return

    logger.info("Building FAISS index from free-form fields …")

    texts: List[str] = []
    meta: List[Dict[str, Any]] = []

    for row in facilities:
        fac_id = row.get("pk_unique_id") or row.get("unique_id", "")
        fac_name = row.get("name", "")
        region = row.get("address_stateOrRegion", "")
        city = row.get("address_city", "")
        fac_type = row.get("facilityTypeId", "")
        org_type = row.get("organization_type", "")

        # Parse JSON array columns
        for field_name in ("procedure", "equipment", "capability"):
            raw = row.get(field_name, "")
            if not raw or raw in ("null", "[]", ""):
                continue
            try:
                facts = json.loads(raw) if isinstance(raw, str) else raw
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(facts, list):
                continue
            for fact in facts:
                if not fact or not isinstance(fact, str) or len(fact.strip()) < 5:
                    continue
                texts.append(fact.strip())
                meta.append(
                    {
                        "facility_id": str(fac_id),
                        "facility_name": fac_name,
                        "field": field_name,
                        "text": fact.strip(),
                        "region": region,
                        "city": city,
                        "facility_type": fac_type,
                        "organization_type": org_type,
                    }
                )

    if not texts:
        logger.warning("No free-form facts found — vector index will be empty.")
        _index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)
        _metadata = []
        return

    logger.info(f"Embedding {len(texts)} facts …")
    embeddings = _embed_texts(texts)

    _index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)
    _index.add(embeddings)
    _metadata = meta

    # Persist to disk
    FAISS_INDEX_PATH.mkdir(parents=True, exist_ok=True)
    faiss.write_index(_index, str(index_file))
    with open(meta_file, "wb") as f:
        pickle.dump(_metadata, f)

    logger.info(f"Built and saved FAISS index with {_index.ntotal} vectors.")


def search(
    query: str,
    top_k: int = TOP_K_VECTOR_RESULTS,
    filter_region: Optional[str] = None,
    filter_field: Optional[str] = None,
    filter_facility_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Semantic search over free-form facility facts.

    Returns list of {text, facility_id, facility_name, field, region, city,
                     facility_type, score}
    """
    global _index, _metadata

    if _index is None or _index.ntotal == 0:
        logger.warning("Vector index not built or empty.")
        return []

    query_vec = _embed_texts([query])
    # Search more than top_k if filtering (we'll post-filter)
    search_k = min(top_k * 5, _index.ntotal) if any([filter_region, filter_field, filter_facility_type]) else top_k
    scores, indices = _index.search(query_vec, search_k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        entry = _metadata[idx].copy()

        # Apply filters
        if filter_region and filter_region.lower() not in entry.get("region", "").lower():
            continue
        if filter_field and entry.get("field") != filter_field:
            continue
        if filter_facility_type and entry.get("facility_type") != filter_facility_type:
            continue

        entry["score"] = float(score)
        results.append(entry)

        if len(results) >= top_k:
            break

    return results
