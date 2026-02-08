# NGO / Health System Data Platform

Platform for NGOs and health officials to see the status of local health systems from free-text data (web, social media). This repo contains **data cleaning and ingest**: CSV → normalized SQL database with duplicate detection (embeddings + AI) and merge.

## Quick start

### 1. Environment

```bash
cp .env.example .env
# Edit .env: set DATABASE_URL, OPENAI_API_KEY
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### 2. Database (no install needed for local dev)

**Local dev / no database installed:** Use SQLite. The ingest script defaults to `sqlite:///health.db` and creates the schema and file automatically when you run it. You do **not** need to install or run any database server.

```bash
# Just run ingest; health.db is created in the project root
python run_ingest.py --limit 2
```

**If you later add PostgreSQL:** Create the DB and run `schema/001_initial.sql`, then pass the URL: `python run_ingest.py --db postgresql://user:pass@host:5432/health_ghana`. See [Database: SQLite vs Postgres](#database-sqlite-vs-postgres) below.

### 3. Verify parser

From the project root (HackNation):

```bash
set PYTHONPATH=.
python -c "from src.datacleaning.parser import load_rows, group_by_pk_unique_id; rows = load_rows(); groups = group_by_pk_unique_id(rows); print('Rows:', len(rows)); print('With pk_unique_id:', sum(len(g) for k,g in groups.items() if k is not None)); print('Without:', len(groups.get(None,[])))"
```

### 4. API for frontend (optional)

To expose CSV ingest to a UI, run the FastAPI app and POST a CSV file:

```bash
uvicorn src.datacleaning.api:app --reload
# POST /ingest with form field "file" = CSV file
# Returns JSON: { "rows_processed": N, "new_organizations": N, "appended_to_existing": N }
```

Or call from Python:

```python
from src.datacleaning.pipeline import ingest_csv

# From file path
metrics = ingest_csv(csv_path="data/new_batch.csv")
# From uploaded content (bytes or str)
metrics = ingest_csv(csv_content=uploaded_file.read())
# metrics = { "rows_processed": 10, "new_organizations": 2, "appended_to_existing": 3 }
```

### 5. Next steps (what you build)

- **LangGraph pipeline:** Add a graph that for each group (or single row) loads DB state, calls the merge/same-or-new agent, and writes back. See `src/datacleaning/pipeline.py`.
- **Embedding store:** Implement `search_similar` and `upsert_embedding` in `src/datacleaning/embedding_store.py` (pgvector or LanceDB).
- **Merge agent:** Prompt that takes new row(s) + current org + top-k candidates and returns `existing_organization_id` or null + merged record (Pydantic).
- **DB write layer:** Map merged record + source rows into `organizations`, `organization_sources`, `organization_specialties`, `organization_facts`, `organization_affiliations`, `organization_embeddings`.
- **RAG:** After ingest, build a content index (LanceDB/FAISS) over descriptions/capabilities for semantic Q&A; keep SQL as source of truth for structured queries.

## Layout

```
HackNation/
  data/
    Virtue Foundation Ghana v0.3 - Sheet1.csv   # Scraped input
    prompts_and_pydantic_models/                 # Extraction prompts & models
  schema/
    001_initial.sql    # Postgres + pgvector
    001_sqlite.sql     # SQLite (embeddings elsewhere)
  src/
    datacleaning/     # Data cleaning & ingest (CSV → DB, merge, geocoding)
      config.py       # Paths, env
      models.py       # ScrapedRow, MergeDecision
      parser.py       # load_csv, load_rows, load_rows_from_content
      identity_embedding.py
      embedding_store.py
      merge_agent.py
      geocode.py
      db.py
      pipeline.py     # process_batch, process_single_row, ingest_csv
      api.py          # FastAPI app for POST /ingest
  run_ingest.py       # CLI ingest
  requirements.txt
  .env.example
```

## Database: SQLite vs Postgres

| | SQLite | PostgreSQL |
|--|--------|------------|
| **Setup** | None. Single file (e.g. `health.db`). | Server required (local install or cloud: Azure, AWS RDS, etc.). |
| **Concurrency** | Single writer at a time. | Many concurrent connections and writers. |
| **Vectors** | No built-in vector type; use a separate store (e.g. LanceDB/FAISS) for embeddings. | Optional **pgvector** extension: store and query embeddings in the same DB. |
| **Good for** | Local dev, demos, hackathons, single-user tools, when you don’t want to run a DB server. | Production, team use, Databricks/cloud jobs, when you need concurrent access or vectors in one DB. |

**In this project:**

- **Now (no local DB):** Use **SQLite**. The ingest script defaults to it; `health.db` is created automatically. No server, no install. Identity embeddings are kept in memory (or you can plug in LanceDB/FAISS later).
- **Later (Databricks or production):** Use **Postgres** (e.g. Azure Database for PostgreSQL, AWS RDS, or another host Databricks can reach). Set `DATABASE_URL` in Databricks secrets and run with that URL. Use `schema/001_initial.sql` (includes pgvector for embeddings in DB if you want).

The same code supports both: the connection URL decides which backend is used (`sqlite:///...` vs `postgresql://...`).

## Deployment (Databricks)

The project is set up so you can deploy to Databricks without changing how config is used:

- **Local:** Use a `.venv` and a `.env` file (python-dotenv). Activating `.venv` is only for isolating dependencies; the app does not depend on the venv path.
- **Databricks:** No `.env` file. Set `DATABRICKS_SECRET_SCOPE` (e.g. in the job or cluster config) and store `OPENAI_API_KEY`, `DATABASE_URL`, and any other secrets in that scope. Use a **PostgreSQL** `DATABASE_URL` (e.g. Azure Postgres, AWS RDS) that your Databricks cluster can reach. `src/config.py` reads from `dbutils.secrets.get(scope, key)` when `DATABRICKS_SECRET_SCOPE` is set, otherwise from `os.getenv` (and locally from `.env` via dotenv).

Use the same `requirements.txt` (or a Databricks wheel) on the cluster so you don’t maintain two dependency lists.

## Design

- **Batch:** Rows are grouped by `pk_unique_id`; each group is processed in one agent call (merge all rows into one org).
- **Streaming:** One new row → compute identity embedding → vector search for top-k candidates → AI decides same org (merge) or new org (insert).
- **Identity embedding:** Built from name + address_city + address_line1 + phone + official_website; stored per organization for duplicate search.
- **Conflict policy:** Prefer non-null/longer for scalars; union and dedupe for lists (specialties, facts); append all sources in `organization_sources`.

See the plan in `.cursor/plans/` (or the plan doc you used) for full architecture.
