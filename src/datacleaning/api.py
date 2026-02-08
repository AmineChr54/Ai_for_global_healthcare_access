"""
Minimal API for frontend: POST CSV file to ingest and get metrics.
Run with: uvicorn src.datacleaning.api:app --reload
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from .config import DATABASE_URL
from .pipeline import ingest_csv

app = FastAPI(title="HackNation Ingest", description="Upload CSV to add data to the health database.")


@app.post("/ingest")
async def ingest_upload(
    file: UploadFile = File(..., description="CSV file with facility/NGO data"),
    db_url: str | None = None,
) -> JSONResponse:
    """
    Upload a CSV file. Data is merged into the database (new orgs or appended to existing).
    Returns metrics: rows_processed, new_organizations, appended_to_existing.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload must be a CSV file")
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    try:
        url = db_url or DATABASE_URL or "sqlite:///health.db"
        metrics = ingest_csv(csv_content=content, db_url=url)
        return JSONResponse(content=metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check for load balancers."""
    return {"status": "ok"}
