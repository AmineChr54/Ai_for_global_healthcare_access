"""Load and parse the scraped CSV into normalized ScrapedRow models."""

import json
import re
from pathlib import Path
from uuid import UUID

import pandas as pd

from .config import DEFAULT_CSV
from .models import ScrapedRow


def _normalize_column(name: str) -> str:
    """Map CSV column name to snake_case (e.g. 'mongo DB' -> mongo_db, officialWebsite -> official_website)."""
    s = name.strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"(?<=[a-z])([A-Z])", r"_\1", s).lower()
    return s


def _parse_json_list(raw: str) -> list:
    """Parse a JSON array string or '[...]' style string; return list of strings."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)) or raw == "" or str(raw).strip() in ("null", "[]"):
        return []
    raw = str(raw).strip()
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if x is not None and str(x).strip()]
            return []
        except json.JSONDecodeError:
            pass
    return []


def _parse_uuid(raw) -> UUID | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)) or str(raw).strip() in ("", "null"):
        return None
    try:
        return UUID(str(raw).strip())
    except (ValueError, TypeError):
        return None


def _parse_int(raw) -> int | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)) or str(raw).strip() in ("", "null"):
        return None
    try:
        return int(float(raw))
    except (ValueError, TypeError):
        return None


def _parse_bool(raw) -> bool | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)) or str(raw).strip() in ("", "null"):
        return None
    s = str(raw).strip().lower()
    if s in ("true", "1", "yes"):
        return True
    if s in ("false", "0", "no"):
        return False
    return None


def _str_or_none(raw) -> str | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)) or str(raw).strip() in ("", "null"):
        return None
    return str(raw).strip()


def load_csv(path: Path | str | None = None) -> pd.DataFrame:
    """Load CSV and normalize column names. Returns DataFrame with snake_case columns."""
    path = Path(path) if path else DEFAULT_CSV
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    df = pd.read_csv(path)
    # Normalize: "mongo DB" -> mongo_db, camelCase -> snake_case
    df.columns = [_normalize_column(str(c)) for c in df.columns]
    return df


def row_to_scraped_row(row: pd.Series) -> ScrapedRow:
    """Convert one DataFrame row to ScrapedRow with parsed types."""
    def get(k: str, default=None):
        return row.get(k, default) if k in row.index else default

    return ScrapedRow(
        source_url=_str_or_none(get("source_url")) or "",
        name=_str_or_none(get("name")) or "",
        pk_unique_id=_parse_int(get("pk_unique_id")),
        mongo_db=_str_or_none(get("mongo_db")),
        specialties=_parse_json_list(get("specialties")),
        procedure=_parse_json_list(get("procedure")),
        equipment=_parse_json_list(get("equipment")),
        capability=_parse_json_list(get("capability")),
        organization_type="facility" if _str_or_none(get("organization_type")) != "ngo" else "ngo",
        content_table_id=_parse_uuid(get("content_table_id")),
        phone_numbers=_parse_json_list(get("phone_numbers")),
        email=_str_or_none(get("email")),
        websites=_parse_json_list(get("websites")),
        official_website=_str_or_none(get("official_website")),
        year_established=_parse_int(get("year_established")),
        accepts_volunteers=_parse_bool(get("accepts_volunteers")),
        facebook_link=_str_or_none(get("facebook_link")),
        twitter_link=_str_or_none(get("twitter_link")),
        linkedin_link=_str_or_none(get("linkedin_link")),
        instagram_link=_str_or_none(get("instagram_link")),
        logo=_str_or_none(get("logo")),
        address_line1=_str_or_none(get("address_line1")),
        address_line2=_str_or_none(get("address_line2")),
        address_line3=_str_or_none(get("address_line3")),
        address_city=_str_or_none(get("address_city")),
        address_state_or_region=_str_or_none(get("address_state_or_region")),
        address_zip_or_postcode=_str_or_none(get("address_zip_or_postcode")),
        address_country=_str_or_none(get("address_country")),
        address_country_code=_str_or_none(get("address_country_code")),
        countries=_parse_json_list(get("countries")),
        mission_statement=_str_or_none(get("mission_statement")),
        mission_statement_link=_str_or_none(get("mission_statement_link")),
        organization_description=_str_or_none(get("organization_description")),
        facility_type_id=_str_or_none(get("facility_type_id")),
        operator_type_id=_str_or_none(get("operator_type_id")),
        affiliation_type_ids=_parse_json_list(get("affiliation_type_ids")),
        description=_str_or_none(get("description")),
        area=_parse_int(get("area")),
        number_doctors=_parse_int(get("number_doctors")),
        capacity=_parse_int(get("capacity")),
        unique_id=_parse_uuid(get("unique_id")),
    )


def load_rows(path: Path | str | None = None) -> list[ScrapedRow]:
    """Load CSV and return list of ScrapedRow. Use for batch pipeline."""
    df = load_csv(path)
    return [row_to_scraped_row(df.loc[i]) for i in range(len(df))]


def load_rows_from_content(csv_content: str | bytes) -> list[ScrapedRow]:
    """Load CSV from string or bytes (e.g. uploaded file). Returns list of ScrapedRow."""
    import io
    if isinstance(csv_content, bytes):
        csv_content = csv_content.decode("utf-8", errors="replace")
    df = pd.read_csv(io.StringIO(csv_content))
    df.columns = [_normalize_column(str(c)) for c in df.columns]
    return [row_to_scraped_row(df.loc[i]) for i in range(len(df))]


def group_by_pk_unique_id(rows: list[ScrapedRow]) -> dict[int | None, list[ScrapedRow]]:
    """Group rows by pk_unique_id. None key = rows with no pk_unique_id."""
    groups: dict[int | None, list[ScrapedRow]] = {}
    for r in rows:
        key = r.pk_unique_id if r.pk_unique_id is not None else None
        groups.setdefault(key, []).append(r)
    return groups
