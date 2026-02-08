# Ingest: CSV path and limit

How to run ingest with a **CSV path** and an optional **limit** (cap on how many row groups to process).

**Pipeline:** Every time ingest runs (CLI or API), it automatically runs **prepare_map_data** afterward so the map frontend (facilities.json, analysis.json) is updated.

---

## 1. Command line (recommended)

From the project root, with Poetry:

```bash
# Ingest entire CSV (uses DATABASE_URL from .env or default sqlite)
poetry run python scripts/run_ingest.py path/to/your.csv

# Ingest with limit: process at most 10 row groups (useful for testing)
poetry run python scripts/run_ingest.py path/to/your.csv --limit 10

# Short form
poetry run python scripts/run_ingest.py path/to/your.csv -l 5

# Override database (otherwise uses .env DATABASE_URL or sqlite:///ghana_dataset/health.db)
poetry run python scripts/run_ingest.py path/to/your.csv -l 10 --db sqlite:///ghana_dataset/health.db
```

**What `--limit` does:** Rows are grouped by `pk_unique_id`. `--limit N` means “process at most N groups”. So with `--limit 10` you process up to 10 distinct organizations’ worth of rows, then stop.

**Example with the default Ghana dataset:**

```bash
poetry run python scripts/run_ingest.py "ghana_dataset/Virtue Foundation Ghana v0.3 - Sheet1.csv" -l 3
```

---

## 2. From Python code

```python
from src.datacleaning.pipeline import ingest_csv

# By path, with limit
metrics = ingest_csv(
    csv_path="/full/path/to/facilities.csv",
    limit_groups=10,
)
print(metrics)  # {"rows_processed": ..., "new_organizations": ..., "appended_to_existing": ..., "rate_limit_hit": ...}

# By path, no limit (process all)
metrics = ingest_csv(csv_path="/full/path/to/facilities.csv")

# Optional: override DB URL
metrics = ingest_csv(
    csv_path="ghana_dataset/data.csv",
    limit_groups=5,
    db_url="sqlite:///ghana_dataset/health.db",
)
```

If you have the CSV in memory (e.g. from an upload), use `csv_content` instead of `csv_path`:

```python
metrics = ingest_csv(
    csv_content=open("path/to/file.csv", "rb").read(),
    limit_groups=20,
)
```

---

## 3. HTTP API (upload + limit)

Start the ingest API:

```bash
uvicorn src.datacleaning.api:app --reload
```

Then POST a CSV file and optionally pass `limit` as a query parameter:

```bash
# Upload and process all row groups
curl -X POST "http://localhost:8000/ingest" -F "file=@path/to/facilities.csv"

# Upload and process at most 10 row groups
curl -X POST "http://localhost:8000/ingest?limit=10" -F "file=@path/to/facilities.csv"
```

Response is JSON, e.g.:

```json
{
  "rows_processed": 15,
  "new_organizations": 12,
  "appended_to_existing": 3,
  "rate_limit_hit": false
}
```

---

## Environment

- **Database:** Set `DATABASE_URL` in `.env` (or in Databricks secrets). Default: `sqlite:///ghana_dataset/health.db`.
- **OpenAI:** Set `OPENAI_API_KEY` in `.env` (or in Databricks secrets); required for merge and reliability steps.

See `.env.example` and the unified config in `src/config.py` for local vs Databricks.
