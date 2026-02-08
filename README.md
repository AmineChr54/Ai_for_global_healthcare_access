# 🏥 VF Healthcare Intelligence Agent

> **AI-Powered Healthcare Access Intelligence for Global Health Equity**

An agentic AI system that analyzes healthcare facility data, identifies service gaps, and provides actionable insights for NGOs and policymakers. This repo also contains the **data cleaning and ingest pipeline**: CSV → normalized SQL database with duplicate detection (embeddings + AI) and merge.

[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2+-green.svg)](https://github.com/langchain-ai/langgraph)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-teal.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Quick Start](#-quick-start)
- [Data Ingest Pipeline](#-data-ingest-pipeline)
- [Agent & API Usage](#-agent--api-usage)
- [Database: SQLite vs Postgres](#database-sqlite-vs-postgres)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Configuration](#-configuration)
- [Deployment (Databricks)](#deployment-databricks)
- [Design (Ingest)](#design-ingest)
- [Example Queries](#-example-queries)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

The VF Healthcare Intelligence Agent helps healthcare planners, NGOs, and policymakers make data-driven decisions about resource allocation. Built for the Virtue Foundation's global healthcare access initiative, it currently focuses on Ghana's healthcare landscape.

**Capabilities:**
- **Natural language interface**: Ask questions like "Where are cardiology medical deserts?"
- **Medical intelligence**: Expands medical terms and validates data
- **Data ingest**: CSV → normalized DB with duplicate detection (embeddings + AI merge), geocoding, and optional FastAPI POST /ingest for frontends
- **Interactive map**: Next.js frontends (`map/`, `virtue-dashboard/`) for exploration

---

## 🚀 Quick Start

### 1. Environment

```bash
cp .env.example .env
# Edit .env: set OPENAI_API_KEY, and optionally DATABASE_URL
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
# Or: pip install -e .   (if using pyproject.toml)
```

### 2. Data ingest (CSV → database)

**Local dev (no DB install):** Use SQLite. The ingest script defaults to `sqlite:///health.db` and creates the schema and file automatically.

```bash
python run_ingest.py --limit 2
```

**With PostgreSQL:** Create the DB, run `schema/001_initial.sql`, then:

```bash
python run_ingest.py --db postgresql://user:pass@host:5432/health_ghana
```

### 3. Verify parser

```bash
set PYTHONPATH=.
python -c "from src.datacleaning.parser import load_rows, group_by_pk_unique_id; rows = load_rows(); groups = group_by_pk_unique_id(rows); print('Rows:', len(rows)); print('With pk_unique_id:', sum(len(g) for k,g in groups.items() if k is not None)); print('Without:', len(groups.get(None,[])))"
```

### 4. Agent & API (full app)

```bash
# One-time: load dataset into DuckDB and build FAISS index
python main.py --init

# Start API
uvicorn api.server:app --reload --host 0.0.0.0 --port 8000
# API: http://localhost:8000   Docs: http://localhost:8000/api/docs

# Frontend (optional, separate terminal)
cd map && npm install && npm run dev
# Or: cd virtue-dashboard && npm install && npm run dev
```

---

## 📥 Data Ingest Pipeline

- **Batch:** Rows grouped by `pk_unique_id`; each group processed in one agent call (merge all rows into one org).
- **Streaming:** One new row → identity embedding → vector search → AI decides same org (merge) or new org (insert).
- **API for frontend:** Run `uvicorn src.datacleaning.api:app --reload` and POST a CSV to `/ingest` (form field `file`).

From Python:

```python
from src.datacleaning.pipeline import ingest_csv

metrics = ingest_csv(csv_path="data/new_batch.csv")
# or: ingest_csv(csv_content=uploaded_file.read())
# → { "rows_processed", "new_organizations", "appended_to_existing" }
```

---

## 💡 Agent & API Usage

### CLI

```bash
python main.py
# > How many hospitals have cardiology?

python main.py "Where are the medical deserts for ophthalmology?" --verbose
```

### REST API

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How many hospitals have cardiology?"}'
```

### Python API

```python
from src.graph import initialize_data, run_query
initialize_data()
result = run_query("How many hospitals have cardiology?")
print(result["synthesis"], result["citations"], result["intent"])
```

---

## Database: SQLite vs Postgres

| | SQLite | PostgreSQL |
|--|--------|------------|
| **Setup** | None. Single file (e.g. `health.db`). | Server required (local or cloud). |
| **Concurrency** | Single writer at a time. | Many concurrent connections. |
| **Vectors** | No built-in vector type; use separate store (LanceDB/FAISS) for embeddings. | Optional **pgvector** for embeddings in same DB. |
| **Good for** | Local dev, demos, hackathons. | Production, team use, Databricks/cloud. |

**In this project:** Use SQLite for local dev (default; `health.db` created automatically). Use Postgres for production or Databricks; set `DATABASE_URL` and run `schema/001_initial.sql`. The same code supports both via the connection URL.

---

## 📁 Project Structure

```
├── api/                    # FastAPI app for agent queries
│   └── server.py
├── main.py                 # CLI entry point (agent)
├── run_ingest.py           # CLI ingest (CSV → DB)
├── run_parser.py           # Parser CLI
├── src/
│   ├── datacleaning/       # Data cleaning & ingest (CSV → DB, merge, geocoding)
│   │   ├── config.py, models.py, parser.py
│   │   ├── identity_embedding.py, embedding_store.py, merge_agent.py
│   │   ├── geocode.py, db.py, pipeline.py, api.py
│   ├── nodes/              # LangGraph pipeline layers (intent, planner, agents, etc.)
│   ├── tools/              # SQL, vector search, geocoding, medical hierarchy
│   ├── graph.py, state.py, config.py
├── schema/
│   ├── 001_initial.sql     # Postgres + pgvector
│   ├── 001_sqlite.sql      # SQLite
├── ghana_dataset/         # Source CSV and docs
├── prompts_and_pydantic_models/
├── map/                    # Next.js map frontend
├── virtue-dashboard/      # Next.js dashboard frontend
├── scripts/
├── requirements.txt
├── .env.example
```

---

## 🏗️ Architecture

**LangGraph pipeline (agent):** Intent Classifier → Query Planner → Retrieval Agents (Text2SQL, Vector Search, Geospatial, External Data) → Medical Reasoner → Synthesizer → Quality Gate.

**Ingest design:** Identity embedding from name + address + phone + website; stored per organization for duplicate search. Conflict policy: prefer non-null/longer for scalars; union/dedupe for lists; append all sources in `organization_sources`.

---

## ⚙️ Configuration

Create `.env` in the project root:

```bash
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small

# Optional: PostgreSQL (omit for SQLite default)
DATABASE_URL=postgresql://...

# Optional: Databricks
DATABRICKS_SECRET_SCOPE=your-scope
```

---

## Deployment (Databricks)

- **Local:** Use `.venv` and `.env` (python-dotenv).
- **Databricks:** No `.env`. Set `DATABRICKS_SECRET_SCOPE` and store `OPENAI_API_KEY`, `DATABASE_URL` in that scope. Use a **PostgreSQL** `DATABASE_URL` the cluster can reach. `src/datacleaning/config.py` (and agent config) reads from `dbutils.secrets.get(scope, key)` when `DATABRICKS_SECRET_SCOPE` is set, else from `os.getenv`.

Use the same `requirements.txt` (or a Databricks wheel) on the cluster.

---

## Design (Ingest)

- **Batch:** Groups by `pk_unique_id`; each group in one agent call.
- **Streaming:** New row → identity embedding → vector search → AI merge or insert.
- **Identity embedding:** name + address_city + address_line1 + phone + official_website.
- **Conflict policy:** Prefer non-null/longer for scalars; union and dedupe for lists; append all sources.

---

## 🎯 Example Queries

- "How many hospitals have cardiology?"
- "Where are the medical deserts for ophthalmology?"
- "Which facilities claim cardiology but lack equipment?"
- "What is the doctor-to-bed ratio by region?"
- "Where do NGOs have overlapping projects?"

---

## 🤝 Contributing

We welcome contributions. Use GitHub Issues for bugs and feature requests. Fork, create a feature branch, add tests, and submit a PR.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built for Global Health Equity** · Virtue Foundation Healthcare Initiative
