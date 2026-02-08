"""Geocoding for organization addresses: agent query + fallback chain + Nominatim & Photon."""

import logging
import time
import urllib.parse
import urllib.request
from typing import Any

from .models import MergedOrganization

LOG = logging.getLogger(__name__)

GEOCODE_COUNTRY_BIAS = "gh"
# Ghana bbox (lon min, lat min, lon max, lat max) for Photon to prefer results in Ghana
GHANA_BBOX = (-3.25, 4.7, 1.2, 11.2)
PHOTON_API = "https://photon.komoot.io/api/"


def _address_string(merged: MergedOrganization) -> str:
    """Build a single-line address from structured fields."""
    parts = []
    for attr in (
        "address_line1",
        "address_line2",
        "address_line3",
        "address_city",
        "address_state_or_region",
        "address_zip_or_postcode",
        "address_country",
    ):
        val = getattr(merged, attr, None)
        if val and str(val).strip():
            parts.append(str(val).strip())
    return ", ".join(parts) if parts else ""


def _normalize_query(q: str, ensure_country: str = "Ghana") -> str:
    """Strip and ensure country suffix for better geocoding."""
    q = (q or "").strip()
    if not q:
        return ""
    if ensure_country and not q.lower().endswith(ensure_country.lower()):
        q = f"{q}, {ensure_country}"
    return q


def _queries_to_try(merged: MergedOrganization, country: str = "Ghana") -> list[str]:
    """Build an ordered list of address strings to try (agent query first, then fallbacks)."""
    out = []
    # 1. Agent-produced geocode_query (best)
    if getattr(merged, "geocode_query", None) and str(merged.geocode_query).strip():
        out.append(_normalize_query(str(merged.geocode_query).strip(), country))
    # 2. Full structured address
    full = _address_string(merged)
    if full:
        out.append(_normalize_query(full, country))
    # 3. Fallbacks: line1 + city, then city only, then line1 only
    line1 = (merged.address_line1 or "").strip()
    city = (merged.address_city or "").strip()
    if line1 and city and f"{line1}, {city}" not in full:
        out.append(_normalize_query(f"{line1}, {city}", country))
    if city and city not in (q for q in out):
        out.append(_normalize_query(city, country))
    if line1 and line1 not in (q for q in out):
        out.append(_normalize_query(line1, country))
    # Dedupe preserving order
    seen = set()
    unique = []
    for q in out:
        if q and q not in seen:
            seen.add(q)
            unique.append(q)
    return unique


def _geocode_nominatim(query: str, country_bias: str | None) -> tuple[float | None, float | None, str | None]:
    """Try Nominatim once. Returns (lat, lon, display_name) or (None, None, None)."""
    try:
        from geopy.geocoders import Nominatim
        from geopy.extra.rate_limiter import RateLimiter
    except ImportError:
        return None, None, None
    geolocator = Nominatim(user_agent="HackNation-HealthIngest/1.0 (health-facility-deduplication)")
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1.0)
    try:
        location: Any = geocode(query, country_codes=country_bias or None)
    except Exception as e:
        LOG.debug("Nominatim error for %r: %s", query[:50], e)
        return None, None, None
    if location and location.latitude is not None and location.longitude is not None:
        display = getattr(location, "raw", {}).get("display_name") if hasattr(location, "raw") else None
        return float(location.latitude), float(location.longitude), display
    return None, None, None


def _geocode_photon(query: str, bbox: tuple[float, float, float, float] | None = GHANA_BBOX) -> tuple[float | None, float | None, str | None]:
    """Try Photon API once. bbox = (lon_min, lat_min, lon_max, lat_max). Returns (lat, lon, display) or (None, None, None)."""
    if not query or not query.strip():
        return None, None, None
    params = {"q": query.strip(), "limit": 1}
    if bbox:
        params["bbox"] = ",".join(str(x) for x in bbox)
    url = PHOTON_API + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = resp.read().decode()
    except Exception as e:
        LOG.debug("Photon request error for %r: %s", query[:50], e)
        return None, None, None
    try:
        import json
        obj = json.loads(data)
    except Exception:
        return None, None, None
    features = obj.get("features") or []
    if not features:
        return None, None, None
    coords = features[0].get("geometry", {}).get("coordinates")
    if not coords or len(coords) < 2:
        return None, None, None
    lon, lat = float(coords[0]), float(coords[1])
    props = features[0].get("properties") or {}
    name = props.get("name") or props.get("street") or props.get("city") or query
    return lat, lon, name


def geocode_address(
    merged: MergedOrganization,
    country_bias: str | None = GEOCODE_COUNTRY_BIAS,
    try_photon: bool = True,
) -> tuple[float | None, float | None, str | None, str]:
    """
    Resolve address to coordinates: try agent geocode_query, then fallback queries; use Nominatim first, then Photon.
    Returns (lat, lon, display_name, message). message e.g. "ok (nominatim)", "ok (photon)", "no address", "no result".
    """
    country = "Ghana" if country_bias == "gh" else (country_bias or "Ghana")
    queries = _queries_to_try(merged, country)
    if not queries:
        return None, None, None, "no address"

    # Try Nominatim for each query (rate limit 1/sec)
    for q in queries:
        lat, lon, display = _geocode_nominatim(q, country_bias)
        if lat is not None and lon is not None:
            return lat, lon, display, "ok (nominatim)"
        time.sleep(1.0)

    # Fallback: Photon (no key, no rate limit beyond politeness)
    if try_photon:
        for q in queries:
            lat, lon, display = _geocode_photon(q)
            if lat is not None and lon is not None:
                return lat, lon, display, "ok (photon)"
            time.sleep(0.3)

    return None, None, None, "no result"
