"""Identity-embedding storage and similarity search. In-memory implementation for local/CI; replace with pgvector or LanceDB for production."""

from typing import List, Tuple
from uuid import UUID

# In-memory store: list of (org_id_str, embedding)
_store: List[Tuple[str, List[float]]] = []


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-10
    nb = math.sqrt(sum(x * x for x in b)) or 1e-10
    return dot / (na * nb)


def search_similar(
    embedding: List[float],
    *,
    top_k: int = 5,
    db_url: str | None = None,
) -> List[Tuple[UUID, float]]:
    """Return top-k (organization_id, similarity_score) for the given identity embedding."""
    if not _store:
        return []
    scored = [(oid, _cosine_similarity(embedding, emb)) for oid, emb in _store]
    scored.sort(key=lambda x: -x[1])
    out: List[Tuple[UUID, float]] = []
    for oid, score in scored[:top_k]:
        try:
            out.append((UUID(oid), score))
        except ValueError:
            continue
    return out


def upsert_embedding(organization_id: UUID, embedding: List[float], *, db_url: str | None = None) -> None:
    """Store or update the identity embedding for an organization."""
    oid_str = str(organization_id)
    global _store
    _store = [(i, e) for i, e in _store if i != oid_str]
    _store.append((oid_str, embedding))
