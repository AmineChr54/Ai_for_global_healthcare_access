"""
IDP Engine — turn messy free-form text (and images/PDFs) into structured facility data.

Architecture:
    1a. Image → text via GPT-4o-mini vision      (1 API call per image, skipped when no images)
    1b. PDF   → text via PyPDF2                   (0 API calls, pure Python)
    2.  Regex field extraction                    (0 API calls)
    3.  Medical specialty mapping via hierarchy    (0 API calls, uses rapidfuzz for fuzzy)
    4.  Per-field confidence scoring               (pure Python)

Public entry point:
    from src.idp.engine import run_idp
    result = run_idp(text="we do heart things", images=[], pdf_files=[])
"""

from __future__ import annotations

import base64
import io
import logging
import re
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional, Set, Tuple

from src.tools.medical_hierarchy import (
    TermMapping,
    expand_medical_terms_with_trace,
)

logger = logging.getLogger(__name__)

# Ghana regions for address parsing
GHANA_REGIONS = [
    "Greater Accra", "Ashanti", "Western", "Central", "Eastern",
    "Volta", "Northern", "Upper East", "Upper West", "Bono",
    "Bono East", "Ahafo", "Oti", "Savannah", "Western North", "North East",
]

FACILITY_TYPES = ["hospital", "pharmacy", "doctor", "clinic", "dentist"]
OPERATOR_TYPES = ["public", "private"]
NGO_KEYWORDS = ["ngo", "non-governmental", "nonprofit", "non-profit", "charitable", "foundation"]


# ── Dataclass for IDP results ────────────────────────────────────────────────


@dataclass
class IDPResult:
    """Complete result of IDP processing."""

    extracted_fields: Dict[str, Any] = dc_field(default_factory=dict)
    specialties: List[str] = dc_field(default_factory=list)
    field_confidences: Dict[str, float] = dc_field(default_factory=dict)
    term_mappings: List[TermMapping] = dc_field(default_factory=list)
    extracted_text_from_images: Optional[str] = None
    llm_calls_used: int = 0


# ── 1. Image → text via GPT-4o-mini vision ──────────────────────────────────


def extract_text_from_image(b64_image: str, mime_type: str = "image/jpeg") -> str:
    """Extract text / medical info from an image using GPT-4o-mini vision.

    Args:
        b64_image: Base64-encoded image bytes.
        mime_type: MIME type of the image (image/jpeg, image/png, etc.).

    Returns:
        Extracted text string.  (1 API call)
    """
    from src.llm import get_llm

    data_url = f"data:{mime_type};base64,{b64_image}"

    llm = get_llm(temperature=0.0)
    response = llm.invoke([
        {
            "role": "system",
            "content": (
                "You are a medical document OCR assistant. "
                "Extract ALL visible text from the image. "
                "Also identify any medical services, equipment, signage, or specialties visible. "
                "Return the extracted text exactly as you see it, followed by a section "
                "'--- Medical observations ---' with any medical services or equipment you observe."
            ),
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                },
                {
                    "type": "text",
                    "text": "Extract all text and medical information from this image.",
                },
            ],
        },
    ])
    return response.content if isinstance(response.content, str) else str(response.content)


# ── 1b. PDF → text via PyPDF2 (0 API calls) ─────────────────────────────────


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF file using PyPDF2 (pure Python, 0 API calls).

    Args:
        pdf_bytes: Raw bytes of the PDF file.

    Returns:
        Concatenated text from all pages, stripped.
    """
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _render_pdf_pages_as_images(pdf_bytes: bytes, dpi: int = 200) -> List[Dict[str, str]]:
    """Render each PDF page as a PNG image and return base64-encoded dicts.

    Uses pymupdf (fitz) to render. This is for scanned/image-based PDFs
    where PyPDF2 cannot extract text.

    Returns:
        List of dicts with keys ``b64`` (base64 data) and ``mime``.
    """
    import fitz  # pymupdf

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images: List[Dict[str, str]] = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        png_bytes = pix.tobytes("png")
        images.append({
            "b64": base64.b64encode(png_bytes).decode("ascii"),
            "mime": "image/png",
        })
    doc.close()
    return images


# ── 2. Regex-based field extraction ──────────────────────────────────────────

# Map of form label patterns → field key.
# These handle OCR output from forms where the label is on one line
# and the value is on the next.
_FORM_LABEL_MAP: List[Tuple[str, str]] = [
    (r"organization\s*name", "canonical_name"),
    (r"(?:facility|clinic|hospital)\s*name", "canonical_name"),
    (r"facility\s*type", "facility_type_id"),
    (r"operator\s*type", "operator_type_id"),
    (r"organization\s*type", "_org_type_raw"),
    (r"city", "address_city"),
    (r"region", "address_state_or_region"),
    (r"address", "address_line1"),
    (r"phone", "official_phone"),
    (r"email", "email"),
    (r"website", "official_website"),
    (r"year\s*established", "year_established"),
    (r"capacity|(?:number of )?beds?", "capacity"),
    (r"(?:number of )?(?:doctors?|physicians?)", "number_doctors"),
]


def _clean_text_for_extraction(text: str) -> str:
    """Strip markdown formatting artifacts from OCR output."""
    # Remove markdown bold markers
    text = re.sub(r'\*\*', '', text)
    # Remove markdown code fences
    text = re.sub(r'```\w*', '', text)
    # Remove leading "Extracted Text:" header
    text = re.sub(r'^Extracted Text:\s*', '', text, flags=re.IGNORECASE)
    # Remove "Medical observations" section header
    text = re.sub(r'---\s*Medical observations\s*---', '', text, flags=re.IGNORECASE)
    return text.strip()


def _extract_from_form_text(text: str) -> Tuple[Dict[str, Any], Set[str]]:
    """Extract fields from form-style OCR output (label on one line, value on next).

    Handles patterns like:
        Organization Name *
        Testology 55

        City *
        Dansoman, Accra
    """
    fields: Dict[str, Any] = {}
    keys: Set[str] = set()
    lines = text.split("\n")

    for i, line in enumerate(lines):
        stripped = line.strip().rstrip(" *")  # Remove trailing asterisks (required field markers)
        if not stripped:
            continue

        for pattern, field_key in _FORM_LABEL_MAP:
            if re.match(rf'^{pattern}\s*\*?\s*$', stripped, re.IGNORECASE):
                # Found a label — the value is on the next non-empty line
                value = ""
                for j in range(i + 1, min(i + 3, len(lines))):
                    candidate = lines[j].strip()
                    if candidate:
                        value = candidate
                        break

                if not value or re.match(r'^[-—]+$', value):
                    continue  # Empty or separator

                # Handle special field types
                if field_key == "_org_type_raw":
                    lower_val = value.lower()
                    if any(kw in lower_val for kw in NGO_KEYWORDS):
                        fields["organization_type"] = "ngo"
                    else:
                        fields["organization_type"] = "facility"
                    keys.add("organization_type")
                elif field_key in ("year_established", "capacity", "number_doctors"):
                    nums = re.findall(r'\d+', value)
                    if nums:
                        fields[field_key] = int(nums[0].replace(",", ""))
                        keys.add(field_key)
                elif field_key == "facility_type_id":
                    lower_val = value.lower()
                    for ft in FACILITY_TYPES:
                        if ft in lower_val:
                            fields[field_key] = ft
                            keys.add(field_key)
                            break
                elif field_key == "operator_type_id":
                    lower_val = value.lower()
                    for ot in OPERATOR_TYPES:
                        if ot in lower_val:
                            fields[field_key] = ot
                            keys.add(field_key)
                            break
                else:
                    fields[field_key] = value
                    keys.add(field_key)
                break  # Matched this line to a label, move to next line

    return fields, keys


def extract_fields_from_text(text: str) -> Tuple[Dict[str, Any], Set[str]]:
    """Extract structured organization fields from free-form text using regex.

    Uses two strategies:
    1. Form-style extraction (label/value on consecutive lines — from OCR)
    2. Prose-style regex extraction (from natural language text)

    Returns:
        (fields_dict, extracted_keys_set) — the dict of extracted fields and
        which keys were successfully extracted.
    """
    fields: Dict[str, Any] = {}
    keys: Set[str] = set()

    if not text or not text.strip():
        return fields, keys

    # Clean markdown artifacts from OCR output
    cleaned = _clean_text_for_extraction(text)
    lower = cleaned.lower()

    # ── Strategy 1: form-style key-value extraction ──────────────────
    form_fields, form_keys = _extract_from_form_text(cleaned)
    fields.update(form_fields)
    keys.update(form_keys)

    # ── Strategy 2: prose-style regex extraction ─────────────────────
    # Only fill in fields not already found by form extraction.

    # ── Name: first sentence subject (heuristic: text before "is a") ─────
    if "canonical_name" not in keys:
        name_match = re.search(r'^([A-Z][^.]*?)(?:\s+is\s+|\s*,)', cleaned)
        if name_match:
            fields["canonical_name"] = name_match.group(1).strip()
            keys.add("canonical_name")

    # ── Organization type ────────────────────────────────────────────────
    if "organization_type" not in keys:
        if any(kw in lower for kw in NGO_KEYWORDS):
            fields["organization_type"] = "ngo"
            keys.add("organization_type")
        elif any(ft in lower for ft in FACILITY_TYPES):
            fields["organization_type"] = "facility"
            keys.add("organization_type")
        else:
            fields["organization_type"] = "facility"

    # ── Facility type ────────────────────────────────────────────────────
    if "facility_type_id" not in keys:
        for ft in FACILITY_TYPES:
            if ft in lower:
                fields["facility_type_id"] = ft
                keys.add("facility_type_id")
                break

    # ── Operator type ────────────────────────────────────────────────────
    if "operator_type_id" not in keys:
        for ot in OPERATOR_TYPES:
            if ot in lower:
                fields["operator_type_id"] = ot
                keys.add("operator_type_id")
                break

    # ── City ─────────────────────────────────────────────────────────────
    if "address_city" not in keys:
        city_match = re.search(
            r'(?:in|located in|city of|town of|based in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)',
            cleaned,
        )
        if city_match:
            fields["address_city"] = city_match.group(1).strip()
            keys.add("address_city")

    # ── Region ───────────────────────────────────────────────────────────
    if "address_state_or_region" not in keys:
        for region in GHANA_REGIONS:
            if region.lower() in lower:
                fields["address_state_or_region"] = region
                keys.add("address_state_or_region")
                break

    # ── Street address ───────────────────────────────────────────────────
    if "address_line1" not in keys:
        addr_match = re.search(
            r'(?:on|at|address:?)\s+([\w\s]+(?:Avenue|Street|Road|Lane|Drive|Blvd|Rd|St))',
            cleaned,
            re.IGNORECASE,
        )
        if addr_match:
            fields["address_line1"] = addr_match.group(1).strip()
            keys.add("address_line1")

    # ── Phone ────────────────────────────────────────────────────────────
    if "official_phone" not in keys:
        phone_match = re.search(r'\+\d{6,15}', cleaned)
        if phone_match:
            fields["official_phone"] = phone_match.group(0)
            keys.add("official_phone")

    # ── Email ────────────────────────────────────────────────────────────
    if "email" not in keys:
        email_match = re.search(r'[\w.-]+@[\w.-]+\.\w+', cleaned)
        if email_match:
            fields["email"] = email_match.group(0)
            keys.add("email")

    # ── Website ──────────────────────────────────────────────────────────
    if "official_website" not in keys:
        website_match = re.search(r'https?://[^\s,;)`]+', cleaned)
        if website_match:
            val = website_match.group(0).rstrip(".,;)")
            # Only keep if it looks like a real URL (not just "https://...")
            if len(val) > len("https://") + 2:
                fields["official_website"] = val
                keys.add("official_website")

    # ── Year established ─────────────────────────────────────────────────
    if "year_established" not in keys:
        year_match = re.search(r'(?:established|founded|since|built)\s+(?:in\s+)?(\d{4})', cleaned, re.IGNORECASE)
        if year_match:
            fields["year_established"] = int(year_match.group(1))
            keys.add("year_established")

    # ── Capacity (beds) ──────────────────────────────────────────────────
    if "capacity" not in keys:
        cap_match = (
            re.search(r'(?:capacity|beds?)\s*(?:of|:)?\s*([\d,]+)', cleaned, re.IGNORECASE)
            or re.search(r'([\d,]+)\s*(?:beds?|bed capacity)', cleaned, re.IGNORECASE)
        )
        if cap_match:
            fields["capacity"] = int(cap_match.group(1).replace(",", ""))
            keys.add("capacity")

    # ── Number of doctors ────────────────────────────────────────────────
    if "number_doctors" not in keys:
        doc_match = (
            re.search(r'(\d[\d,]*)\s*(?:doctors?|physicians?)', cleaned, re.IGNORECASE)
            or re.search(r'(?:doctors?|physicians?)\s*(?:of|:)?\s*(\d[\d,]*)', cleaned, re.IGNORECASE)
        )
        if doc_match:
            raw = (doc_match.group(1) or doc_match.group(2) or "").replace(",", "")
            if raw:
                fields["number_doctors"] = int(raw)
                keys.add("number_doctors")

    # ── Coordinates ──────────────────────────────────────────────────────
    if "lat" not in keys:
        coord_match = re.search(r'(?:coordinates?:?\s*)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)', cleaned)
        if coord_match:
            lat = float(coord_match.group(1))
            lon = float(coord_match.group(2))
            if 4.5 <= lat <= 11.5 and -3.5 <= lon <= 1.5:
                fields["lat"] = lat
                fields["lon"] = lon
                keys.add("lat")
                keys.add("lon")

    # ── Description ──────────────────────────────────────────────────────
    if len(cleaned) > 20:
        fields["description"] = cleaned
        keys.add("description")

    # ── Accepts volunteers ───────────────────────────────────────────────
    if "volunteer" in lower:
        fields["accepts_volunteers"] = (
            "accepts volunteer" in lower
            or "welcome volunteer" in lower
            or "accepting volunteer" in lower
        )
        keys.add("accepts_volunteers")

    # ── Mission statement (NGO) ──────────────────────────────────────────
    if "mission_statement" not in keys:
        mission_match = re.search(r'mission[:\s]+"?([^".]+)"?', cleaned, re.IGNORECASE)
        if mission_match:
            fields["mission_statement"] = mission_match.group(1).strip()
            keys.add("mission_statement")

    return fields, keys


# ── 3. Confidence scoring ────────────────────────────────────────────────────


def _compute_field_confidences(
    extracted_keys: Set[str],
    term_mappings: List[TermMapping],
) -> Dict[str, float]:
    """Assign confidence to each extracted field based on how it was matched."""
    confidences: Dict[str, float] = {}

    # Regex-extracted fields get high confidence
    for key in extracted_keys:
        confidences[key] = 0.85

    # Boost fields that are very reliable regex patterns
    for key in ("official_phone", "email", "official_website", "lat", "lon"):
        if key in extracted_keys:
            confidences[key] = 0.95

    # Name and description are heuristic-based, slightly lower
    if "canonical_name" in extracted_keys:
        confidences["canonical_name"] = 0.75
    if "description" in extracted_keys:
        confidences["description"] = 0.60

    # Specialty confidence comes from the mapping trace
    if term_mappings:
        avg_conf = sum(m.confidence for m in term_mappings) / len(term_mappings)
        confidences["specialties"] = round(avg_conf, 2)

    return confidences


# ── 4. Main IDP pipeline ────────────────────────────────────────────────────


def run_idp(
    text: str = "",
    images: Optional[List[Dict[str, str]]] = None,
    pdf_files: Optional[List[bytes]] = None,
) -> IDPResult:
    """Run the full IDP pipeline.

    Args:
        text: Free-form text describing a facility/organization.
        images: List of dicts with keys ``b64`` (base64 data) and ``mime``
                (e.g. ``"image/jpeg"``).  Can be ``None`` or empty.
        pdf_files: List of raw PDF bytes.  Text is extracted via PyPDF2
                   (0 API calls).  Can be ``None`` or empty.

    Returns:
        IDPResult with extracted fields, specialties, confidences, and
        the medical term mapping trace.
    """
    result = IDPResult()
    combined_text = text or ""

    # ── Step 1a: extract text from PDFs ─────────────────────────────────
    #   First try PyPDF2 (0 API calls). If that returns nothing (scanned
    #   PDF), render pages as images and fall through to vision OCR.
    if images is None:
        images = []

    if pdf_files:
        pdf_texts: List[str] = []
        for pdf_bytes in pdf_files:
            try:
                extracted = extract_text_from_pdf(pdf_bytes)
                if extracted:
                    pdf_texts.append(extracted)
                    logger.info(f"PDF text extraction got {len(extracted)} chars")
                else:
                    # Scanned / image-based PDF — render pages as images
                    # so they are picked up by the vision OCR step below.
                    logger.info(
                        "PDF has no extractable text (scanned?). "
                        "Rendering pages as images for vision OCR."
                    )
                    try:
                        page_images = _render_pdf_pages_as_images(pdf_bytes)
                        images.extend(page_images)
                        logger.info(
                            f"Rendered {len(page_images)} PDF page(s) as images"
                        )
                    except Exception as render_err:
                        logger.warning(f"PDF page rendering failed: {render_err}")
            except Exception as e:
                logger.warning(f"PDF extraction failed: {e}")
        if pdf_texts:
            combined_text = f"{combined_text}\n\n{chr(10).join(pdf_texts)}".strip()

    # ── Step 1b: extract text from images (1 API call each) ──────────────
    if images:
        image_texts: List[str] = []
        for img in images:
            try:
                extracted = extract_text_from_image(
                    img["b64"],
                    mime_type=img.get("mime", "image/jpeg"),
                )
                image_texts.append(extracted)
                result.llm_calls_used += 1
                logger.info(f"Image OCR extracted {len(extracted)} chars")
            except Exception as e:
                logger.warning(f"Image extraction failed: {e}")

        if image_texts:
            result.extracted_text_from_images = "\n\n".join(image_texts)
            combined_text = f"{combined_text}\n\n{result.extracted_text_from_images}".strip()

    if not combined_text.strip():
        return result

    # ── Step 2: regex-based field extraction (0 API calls) ───────────────
    fields, extracted_keys = extract_fields_from_text(combined_text)
    result.extracted_fields = fields

    # ── Step 3: medical specialty mapping (0 API calls) ──────────────────
    trace, specialties = expand_medical_terms_with_trace(combined_text)
    result.specialties = specialties
    result.term_mappings = trace

    if specialties:
        logger.info(
            f"IDP mapped to {len(specialties)} specialties: {specialties} "
            f"({len(trace)} trace entries)"
        )

    # ── Step 4: confidence scoring ───────────────────────────────────────
    result.field_confidences = _compute_field_confidences(extracted_keys, trace)

    return result
