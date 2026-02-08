"""
IDP (Intelligent Document Parsing) API Router.

Single endpoint that accepts text and/or files (images + PDFs) and returns
structured facility data, medical specialties, confidence scores, and a
full mapping trace showing how free-form language was resolved to canonical
medical taxonomy terms.

LLM usage: 0 calls for text-only / PDF-only, 1 call per image for vision OCR.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import sys
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

# Ensure project root on sys.path
PROJECT_ROOT = str(Path(__file__).parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from api.schemas import IDPResponse, IDPTermMapping
from src.idp.engine import IDPResult, run_idp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/idp", tags=["idp"])

# Max file size: 10 MB
_MAX_FILE_BYTES = 10 * 1024 * 1024
_ALLOWED_IMAGE_PREFIXES = ("image/jpeg", "image/png", "image/webp", "image/gif")
_PDF_MIME = "application/pdf"


def _result_to_response(result: IDPResult) -> IDPResponse:
    """Convert engine IDPResult dataclass to API IDPResponse schema."""
    return IDPResponse(
        extracted_fields=result.extracted_fields,
        specialties=result.specialties,
        field_confidences=result.field_confidences,
        term_mappings=[
            IDPTermMapping(
                input_term=m.input_term,
                matched_key=m.matched_key,
                match_type=m.match_type,
                confidence=m.confidence,
                mapped_specialties=m.mapped_specialties,
            )
            for m in result.term_mappings
        ],
        extracted_text_from_images=result.extracted_text_from_images,
        llm_calls_used=result.llm_calls_used,
    )


@router.post("/parse", response_model=IDPResponse, status_code=status.HTTP_200_OK)
async def parse_document(
    text: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
):
    """Parse free-form text, images, and/or PDFs into structured facility data.

    **Text-only / PDF-only**: 0 LLM calls. Pure regex + fuzzy medical term matching.
    **With images**: 1 LLM call per image (GPT-4o-mini vision OCR).

    Returns extracted organization fields, canonical medical specialties,
    per-field confidence scores, and a mapping trace that shows exactly
    how informal terms were resolved (e.g. "we do heart things" →
    "heart" → ["cardiology"]).
    """
    if not text and not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least 'text' or one file (image or PDF).",
        )

    logger.info(
        f"IDP parse request: text={len(text or '')} chars, "
        f"files={len(files)}"
    )
    start = time.time()

    # Read and classify uploaded files into images and PDFs
    images = []
    pdf_files: list[bytes] = []
    for f in files:
        content_type = f.content_type or ""

        # PDF files → extract text via PyPDF2 (0 API calls)
        if content_type == _PDF_MIME:
            data = await f.read()
            if len(data) > _MAX_FILE_BYTES:
                logger.warning(f"Skipping oversized PDF: {f.filename} ({len(data)} bytes)")
                continue
            pdf_files.append(data)
            logger.info(f"Accepted PDF: {f.filename} ({len(data)} bytes)")
            continue

        # Image files → encode to base64 for vision OCR
        if any(content_type.startswith(p) for p in _ALLOWED_IMAGE_PREFIXES):
            data = await f.read()
            if len(data) > _MAX_FILE_BYTES:
                logger.warning(f"Skipping oversized image: {f.filename} ({len(data)} bytes)")
                continue
            images.append({
                "b64": base64.b64encode(data).decode("ascii"),
                "mime": content_type,
            })
            continue

        # Unknown file type — skip with warning
        logger.warning(f"Skipping unsupported file: {f.filename} ({content_type})")

    # Run the IDP engine (may block on LLM call for images)
    result: IDPResult = await asyncio.to_thread(
        run_idp,
        text=text or "",
        images=images or None,
        pdf_files=pdf_files or None,
    )

    elapsed = time.time() - start
    logger.info(
        f"IDP parse complete in {elapsed:.2f}s | "
        f"fields={len(result.extracted_fields)} | "
        f"specialties={result.specialties} | "
        f"llm_calls={result.llm_calls_used}"
    )

    return _result_to_response(result)
