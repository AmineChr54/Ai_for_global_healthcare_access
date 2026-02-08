"""
Minimal API for frontend: POST CSV file to ingest and get metrics.
Run with: uvicorn src.datacleaning.api:app --reload
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from .config import DATABASE_URL
from .pipeline import ingest_csv, refresh_map_data_after_ingest

app = FastAPI(title="HackNation Ingest", description="Upload CSV to add data to the health database.")


@app.post("/ingest")
async def ingest_upload(
    file: UploadFile = File(..., description="CSV file with facility/NGO data"),
    limit: int | None = None,
    db_url: str | None = None,
) -> JSONResponse:
    """
    Upload a CSV file. Data is merged into the database (new orgs or appended to existing).
    Optional query param: limit = max number of row groups to process (for testing).
    Returns metrics: rows_processed, new_organizations, appended_to_existing.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload must be a CSV file")
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    try:
        url = db_url or DATABASE_URL or "sqlite:///ghana_dataset/health.db"
        metrics = ingest_csv(csv_content=content, limit_groups=limit, db_url=url)
        # Pipeline: refresh map data so the map frontend is up to date
        refresh_map_data_after_ingest(db_url=url)
        return JSONResponse(content=metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check for load balancers."""
    return {"status": "ok"}
