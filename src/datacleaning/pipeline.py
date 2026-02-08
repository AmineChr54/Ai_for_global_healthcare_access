"""Orchestration: batch grouping, embedding search, merge agent, DB write."""

from dataclasses import dataclass
from uuid import UUID, uuid4

from .api_errors import is_rate_limit_error, format_rate_limit_message
from .config import (
    GEOCODE_ENABLED,
    EMBEDDING_SIMILARITY_THRESHOLD,
    MAX_CANDIDATES_FOR_AGENT,
)
from .db import (
    get_connection,
    init_db,
    get_organization_by_mongo_db,
    get_all_organizations_for_embedding,
    get_candidates,
    upsert_organization,
    update_lat_lon,
    record_processed,
)
from .embedding_store import search_similar, upsert_embedding
from .geocode import geocode_address
from .identity_embedding import (
    build_identity_text_from_org,
    embed_identity,
    embed_identity_batch,
    embed_row_identity,
)
from .merge_agent import run_merge_agent, row_to_merged_organization, compute_reliability_for_org
from .models import MergeDecision, MergedOrganization, ScrapedRow
from .parser import group_by_pk_unique_id, load_rows, load_rows_from_content


@dataclass
class IngestMetrics:
    """Result of a batch ingest for UI/API."""
    rows_processed: int
    new_organizations: int
    appended_to_existing: int
    rate_limit_hit: bool = False

    def to_dict(self) -> dict:
        return {
            "rows_processed": self.rows_processed,
            "new_organizations": self.new_organizations,
            "appended_to_existing": self.appended_to_existing,
            "rate_limit_hit": self.rate_limit_hit,
        }


def _merged_to_reliability_dict(merged: MergedOrganization) -> dict:
    """Build org dict for compute_reliability_for_org from a MergedOrganization."""
    return {
        "canonical_name": merged.canonical_name,
        "organization_type": merged.organization_type,
        "address_line1": merged.address_line1,
        "address_line2": merged.address_line2,
        "address_city": merged.address_city,
        "address_state_or_region": merged.address_state_or_region,
        "address_zip_or_postcode": merged.address_zip_or_postcode,
        "address_country": merged.address_country,
        "address_country_code": merged.address_country_code,
        "description": merged.description,
        "facility_type_id": merged.facility_type_id,
        "operator_type_id": merged.operator_type_id,
        "specialties": merged.specialties or [],
        "procedure": merged.procedure or [],
        "equipment": merged.equipment or [],
        "capability": merged.capability or [],
    }


def _set_reliability_on_merged(merged: MergedOrganization) -> None:
    """Compute reliability for a merged org (when agent was skipped) and set on the model."""
    org_dict = _merged_to_reliability_dict(merged)
    score, explanation = compute_reliability_for_org(org_dict)
    if score is not None:
        merged.reliability_score = score
        merged.reliability_explanation = explanation


def bootstrap_embedding_store(conn, db_url: str | None = None) -> int:
    """
    Load all organizations from the DB, compute identity embeddings in batch, and add them to the store.
    Uses batched embedding API to minimize requests. Returns the number of orgs loaded.
    """
    orgs = get_all_organizations_for_embedding(conn)
    items = [(o["id"], build_identity_text_from_org(o)) for o in orgs]
    items = [(oid, t) for oid, t in items if t]
    if not items:
        return 0
    try:
        ids = [x[0] for x in items]
        texts = [x[1] for x in items]
        embeddings = embed_identity_batch(texts)
        for org_id, emb in zip(ids, embeddings):
            upsert_embedding(UUID(org_id), emb, db_url=db_url)
        return len(ids)
    except Exception:
        return 0


def process_batch(
    csv_path=None,
    limit_groups: int | None = None,
    db_url: str | None = None,
    rows: list[ScrapedRow] | None = None,
) -> IngestMetrics:
    """
    Batch ingest: load CSV (or use provided rows), group by pk_unique_id, run merge agent, write to DB.
    Returns IngestMetrics (rows_processed, new_organizations, appended_to_existing).
    """
    if rows is None:
        rows = load_rows(csv_path)
    groups = group_by_pk_unique_id(rows)
    conn = get_connection(db_url)
    init_db(conn, db_url)
    rows_processed = 0
    new_organizations = 0
    appended_to_existing = 0
    # Bootstrap embedding store from existing DB so we can match new rows to existing orgs (append mode)
    try:
        n_boot = bootstrap_embedding_store(conn, db_url)
        if n_boot:
            print(f"Embedding store: loaded {n_boot} organization(s) from DB for append matching.")
    except BaseException as e:
        if is_rate_limit_error(e):
            print("API rate limit reached during embedding bootstrap. Stopping early.")
            print(f"  Error: {format_rate_limit_message(e)}")
            conn.close()
            return IngestMetrics(0, 0, 0, rate_limit_hit=True)
        raise
    items = [(k, v) for k, v in groups.items() if k is not None]
    items.sort(key=lambda x: x[0] or 0)
    if None in groups:
        items.append((None, groups[None]))
    if limit_groups is not None:
        items = items[:limit_groups]
    for pk_id, group_rows in items:
        if not group_rows:
            continue
        try:
            current_org = None
            candidates = []
            first = group_rows[0]
            if pk_id is not None and first.mongo_db:
                current_org = get_organization_by_mongo_db(conn, first.mongo_db)
                if current_org:
                    candidates = [current_org]
            if not candidates:
                embedding = embed_row_identity(first)
                similar = search_similar(embedding, top_k=10, db_url=db_url)
                # Only pass close matches to the agent to save tokens
                close = [(oid, score) for oid, score in similar if score >= EMBEDDING_SIMILARITY_THRESHOLD][:MAX_CANDIDATES_FOR_AGENT]
                if close:
                    candidate_ids = [str(oid) for oid, _ in close]
                    candidates = get_candidates(conn, candidate_ids)
            # Skip LLM when single row and no candidates (clearly new org) to save API calls
            if len(group_rows) == 1 and not candidates and not current_org:
                merged = row_to_merged_organization(first)
                # Still compute reliability for new orgs (one small LLM call)
                _set_reliability_on_merged(merged)
                decision = MergeDecision(existing_organization_id=None, merged_organizations=[merged], row_assignments=[[0]])
            else:
                decision = run_merge_agent(group_rows, candidates, current_org)
            # Only first merged org can update an existing org (single location merge)
            existing_id = str(decision.existing_organization_id) if decision.existing_organization_id else None
            # Ensure organization_group_id is set when we have multiple locations
            group_id = str(uuid4())[:8] if len(decision.merged_organizations) > 1 else None
            for i, merged in enumerate(decision.merged_organizations):
                if len(decision.merged_organizations) > 1 and not merged.organization_group_id:
                    merged.organization_group_id = group_id
                indices = decision.row_assignments[i] if decision.row_assignments and i < len(decision.row_assignments) else list(range(len(group_rows)))
                assigned_rows = [group_rows[j] for j in indices if 0 <= j < len(group_rows)]
                if not assigned_rows:
                    assigned_rows = [first]
                use_existing = existing_id if (i == 0 and existing_id) else None
                org_id = upsert_organization(conn, merged, assigned_rows, use_existing)
                if use_existing:
                    appended_to_existing += 1
                    print(f"  Appended to existing: {org_id!r} ({merged.canonical_name!r})")
                else:
                    new_organizations += 1
                    print(f"  New entry created: {org_id!r} ({merged.canonical_name!r})")
                if GEOCODE_ENABLED and merged.lat is None and merged.lon is None:
                    lat, lon, _display, msg = geocode_address(merged)
                    if lat is not None and lon is not None:
                        update_lat_lon(conn, org_id, lat, lon)
                        print(f"  Geocoded: {merged.canonical_name!r} -> ({lat:.5f}, {lon:.5f})")
                    else:
                        addr_preview = (merged.address_line1 or merged.address_city or "?")[:50]
                        print(f"  Geocoding: {merged.canonical_name!r} -> {msg} ({addr_preview})")
                rep = assigned_rows[0]
                new_embedding = embed_row_identity(rep)
                upsert_embedding(UUID(org_id), new_embedding, db_url=db_url)
                for row in assigned_rows:
                    record_processed(conn, row.source_url, str(row.content_table_id) if row.content_table_id else None, org_id)
            rows_processed += len(group_rows)
        except BaseException as e:
            if is_rate_limit_error(e):
                print("API rate limit reached. Stopping early. Processed so far:")
                print(f"  Rows: {rows_processed}, New organizations: {new_organizations}, Appended to existing: {appended_to_existing}")
                print(f"  Error: {format_rate_limit_message(e)}")
                conn.close()
                return IngestMetrics(rows_processed, new_organizations, appended_to_existing, rate_limit_hit=True)
            raise
    conn.close()
    return IngestMetrics(rows_processed=rows_processed, new_organizations=new_organizations, appended_to_existing=appended_to_existing)


def ingest_csv(
    csv_path: str | None = None,
    csv_content: str | bytes | None = None,
    db_url: str | None = None,
    limit_groups: int | None = None,
) -> dict:
    """
    Frontend/API entry: ingest a CSV (by path or uploaded content) and return metrics for the UI.

    Pass either csv_path (path to a file) or csv_content (string or bytes from an uploaded file).
    Returns a dict with: rows_processed, new_organizations, appended_to_existing.
    """
    if csv_content is not None:
        rows = load_rows_from_content(csv_content)
        metrics = process_batch(rows=rows, limit_groups=limit_groups, db_url=db_url)
    elif csv_path:
        metrics = process_batch(csv_path=csv_path, limit_groups=limit_groups, db_url=db_url)
    else:
        raise ValueError("Provide either csv_path or csv_content")
    return metrics.to_dict()


def process_single_row(row: ScrapedRow, db_url: str | None = None) -> str:
    """Streaming ingest: one new row. Match to existing org by embedding or create new."""
    conn = get_connection(db_url)
    init_db(conn, db_url)
    bootstrap_embedding_store(conn, db_url)
    embedding = embed_row_identity(row)
    similar = search_similar(embedding, top_k=10, db_url=db_url)
    close = [(oid, score) for oid, score in similar if score >= EMBEDDING_SIMILARITY_THRESHOLD][:MAX_CANDIDATES_FOR_AGENT]
    candidate_ids = [str(oid) for oid, _ in close]
    candidates = get_candidates(conn, candidate_ids)
    # Skip LLM when no candidates (clearly new org) to save API calls
    if not candidates:
        merged = row_to_merged_organization(row)
        _set_reliability_on_merged(merged)
        existing_id = None
    else:
        decision = run_merge_agent([row], candidates, None)
        merged = decision.merged_organizations[0] if decision.merged_organizations else None
        if not merged:
            from .models import MergedOrganization
            merged = MergedOrganization(canonical_name=row.name, organization_type=row.organization_type)
        existing_id = str(decision.existing_organization_id) if decision.existing_organization_id else None
    org_id = upsert_organization(conn, merged, [row], existing_id)
    if existing_id:
        print(f"Appended to existing: {org_id!r} ({merged.canonical_name!r})")
    else:
        print(f"New entry created: {org_id!r} ({merged.canonical_name!r})")
    if GEOCODE_ENABLED and merged.lat is None and merged.lon is None:
        lat, lon, _display, msg = geocode_address(merged)
        if lat is not None and lon is not None:
            update_lat_lon(conn, org_id, lat, lon)
            print(f"Geocoded: {merged.canonical_name!r} -> ({lat:.5f}, {lon:.5f})")
        else:
            print(f"Geocoding: {merged.canonical_name!r} -> {msg}")
    upsert_embedding(UUID(org_id), embedding, db_url=db_url)
    record_processed(conn, row.source_url, str(row.content_table_id) if row.content_table_id else None, org_id)
    conn.close()
    return org_id


def refresh_map_data_after_ingest(db_url: str | None = None) -> bool:
    """
    Run prepare_map_data so the map frontend gets updated facilities.json and analysis.json.
    Call after ingest. Uses DATABASE_URL from env (or db_url if provided). Returns True on success.
    """
    import os
    import subprocess
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent.parent
    script = root / "scripts" / "prepare_map_data.py"
    if not script.exists():
        return False
    env = os.environ.copy()
    if db_url:
        env["DATABASE_URL"] = db_url
    try:
        r = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(root),
            env=env,
            capture_output=False,
        )
        return r.returncode == 0
    except Exception:
        return False
