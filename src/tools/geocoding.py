"""
Ghana Geocoding — maps cities/regions to approximate coordinates.

The CSV has no lat/lon columns, so we maintain a lookup table of known
Ghana city coordinates. For unknown cities, we fall back to region centroids.
The frontend owns the actual map; this module provides coordinates for
distance calculations in the Geospatial Agent.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

# ── Known Ghana city coordinates (lat, lon) ─────────────────────────────────
# Source: approximate centroids from OpenStreetMap / Google Maps
GHANA_CITIES: Dict[str, Tuple[float, float]] = {
    # Greater Accra
    "accra": (5.6037, -0.1870),
    "tema": (5.6698, -0.0166),
    "teshie": (5.5796, -0.1062),
    "nungua": (5.5913, -0.0775),
    "madina": (5.6699, -0.1668),
    "adenta": (5.7095, -0.1575),
    "ashaiman": (5.6894, -0.0360),
    "dansoman": (5.5467, -0.2614),
    "kasoa": (5.5345, -0.4178),
    "east legon": (5.6350, -0.1540),
    "osu": (5.5593, -0.1790),
    "labadi": (5.5650, -0.1530),
    "cantonments": (5.5720, -0.1750),
    "dzorwulu": (5.6100, -0.2000),
    "lapaz": (5.6070, -0.2470),
    "nima": (5.5884, -0.2097),
    "dome": (5.6500, -0.2330),
    "haatso": (5.6650, -0.2100),
    "legon": (5.6505, -0.1862),
    "weija": (5.5600, -0.3500),
    "tesano": (5.6100, -0.2350),
    "achimota": (5.6300, -0.2370),
    "ridge": (5.5700, -0.2000),
    "james town": (5.5350, -0.2050),
    "north kaneshie": (5.5900, -0.2400),
    "odorkor": (5.5800, -0.2700),
    "kwashieman": (5.5800, -0.2530),
    # Ashanti
    "kumasi": (6.6885, -1.6244),
    "ejisu": (6.7270, -1.4600),
    "bekwai": (6.4560, -1.5710),
    "mampong": (7.0650, -1.4030),
    "obuasi": (6.2060, -1.6620),
    "agogo": (6.7940, -1.0810),
    "konongo": (6.6170, -1.2130),
    "offinso": (7.0380, -1.6650),
    "ejura": (7.3840, -1.3620),
    "tepa": (7.0190, -1.9100),
    "juaben": (6.7250, -1.4100),
    "asokore mampong": (6.7100, -1.6000),
    "kuntanase": (6.5300, -1.5800),
    "nkawie": (6.6150, -1.8010),
    # Western
    "takoradi": (4.8976, -1.7603),
    "sekondi": (4.9140, -1.7100),
    "tarkwa": (5.3040, -1.9940),
    "axim": (4.8660, -2.2410),
    "bogoso": (5.5380, -2.0000),
    "bibiani": (6.4630, -2.3300),
    "enchi": (5.8280, -2.8130),
    "sefwi wiawso": (6.2050, -2.4900),
    # Central
    "cape coast": (5.1036, -1.2466),
    "winneba": (5.3530, -0.6230),
    "mankessim": (5.2670, -1.0150),
    "agona swedru": (5.5300, -0.8950),
    "apam": (5.2760, -0.7460),
    "assin-foso": (5.8000, -1.2500),
    # Eastern
    "koforidua": (6.0941, -0.2636),
    "nkawkaw": (6.5500, -0.7700),
    "asamankese": (5.8630, -0.6600),
    "akwatia": (6.0400, -0.8000),
    "somanya": (6.1060, -0.0150),
    "nsawam": (5.8030, -0.3560),
    "suhum": (6.0400, -0.4500),
    "akosombo": (6.2920, 0.0450),
    # Volta
    "ho": (6.6012, 0.4693),
    "hohoe": (7.1510, 0.4740),
    "keta": (5.9190, 0.9870),
    "kpando": (6.9950, 0.2980),
    "aflao": (6.1170, 1.1940),
    "sogakope": (6.0050, 0.6330),
    "dzodze": (6.2150, 1.0020),
    # Northern
    "tamale": (9.4007, -0.8393),
    "yendi": (9.4330, -0.0100),
    "bimbilla": (8.8530, -0.0580),
    "damongo": (9.0870, -1.8200),
    "salaga": (8.5570, -0.5190),
    "tolon": (9.4330, -1.0600),
    # Upper East
    "bolgatanga": (10.7870, -0.8540),
    "bawku": (11.0590, -0.2420),
    "navrongo": (10.8940, -1.0930),
    "sandema": (10.6250, -1.0620),
    # Upper West
    "wa": (10.0601, -2.5099),
    "tumu": (10.8800, -1.9700),
    "nadawli": (10.3920, -2.6530),
    "lawra": (10.6310, -2.8980),
    # Bono / Bono East / Ahafo
    "sunyani": (7.3349, -2.3265),
    "berekum": (7.4500, -2.5800),
    "techiman": (7.5833, -1.9394),
    "wenchi": (7.7410, -2.1060),
    "kintampo": (8.0560, -1.7310),
    "goaso": (6.8020, -2.5150),
    "dormaa ahenkro": (7.3500, -2.9600),
    "atebubu": (7.7500, -0.9830),
    "yeji": (8.2250, -0.6580),
    # Savannah
    "bole": (9.0330, -2.4860),
    # Oti
    "nkwanta": (8.2610, 0.5080),
    # Western North
    "sefwi bekwai": (6.2130, -2.3300),
    "juaboso": (6.2380, -2.8340),
}

# Region centroids (fallback when city isn't in the lookup)
GHANA_REGIONS: Dict[str, Tuple[float, float]] = {
    "greater accra": (5.6037, -0.1870),
    "ashanti": (6.7470, -1.5209),
    "western": (5.0900, -1.9400),
    "western north": (6.2000, -2.5000),
    "central": (5.3000, -1.1000),
    "eastern": (6.2000, -0.5000),
    "volta": (6.7000, 0.5000),
    "oti": (8.0000, 0.5000),
    "northern": (9.5000, -1.0000),
    "savannah": (9.0000, -1.8000),
    "north east": (10.5000, -0.3000),
    "upper east": (10.8000, -0.8000),
    "upper west": (10.3000, -2.4000),
    "bono": (7.5000, -2.3000),
    "bono east": (7.8000, -1.5000),
    "ahafo": (6.9000, -2.4000),
    "brong ahafo": (7.5000, -1.7000),
}


def geocode(city: Optional[str], region: Optional[str]) -> Optional[Tuple[float, float]]:
    """
    Return (lat, lon) for a Ghana city/region. Falls back to region centroid,
    then returns None if nothing matches.
    """
    if city:
        key = city.strip().lower()
        if key in GHANA_CITIES:
            return GHANA_CITIES[key]

    if region:
        key = region.strip().lower()
        # Try exact match first
        if key in GHANA_REGIONS:
            return GHANA_REGIONS[key]
        # Fuzzy: check if any region key is contained in the input
        for rname, coords in GHANA_REGIONS.items():
            if rname in key or key in rname:
                return coords

    return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Geodesic distance between two points in km (Haversine formula)."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def facilities_within_radius(
    facilities: List[Dict],
    center_lat: float,
    center_lon: float,
    radius_km: float,
) -> List[Dict]:
    """Return facilities within radius_km of (center_lat, center_lon)."""
    results = []
    for fac in facilities:
        coords = geocode(fac.get("address_city"), fac.get("address_stateOrRegion"))
        if coords is None:
            continue
        dist = haversine_km(center_lat, center_lon, coords[0], coords[1])
        if dist <= radius_km:
            fac_copy = fac.copy()
            fac_copy["_distance_km"] = round(dist, 2)
            fac_copy["_lat"] = coords[0]
            fac_copy["_lon"] = coords[1]
            results.append(fac_copy)
    results.sort(key=lambda x: x["_distance_km"])
    return results


def find_cold_spots(
    facilities: List[Dict],
    specialty_filter: Optional[str] = None,
    radius_km: float = 50.0,
) -> List[Dict]:
    """
    Identify geographic 'cold spots' — regions/cities that have no facility
    (optionally with a given specialty) within radius_km.

    Returns list of {region, city, lat, lon, nearest_facility_km}.
    """
    # Build set of geocoded facilities
    fac_coords = []
    for fac in facilities:
        if specialty_filter:
            specs = fac.get("specialties", "")
            if specialty_filter.lower() not in specs.lower():
                continue
        coords = geocode(fac.get("address_city"), fac.get("address_stateOrRegion"))
        if coords:
            fac_coords.append(coords)

    # Check every known city
    cold_spots = []
    all_cities = {**GHANA_CITIES}
    for city_name, (lat, lon) in all_cities.items():
        if not fac_coords:
            cold_spots.append(
                {
                    "city": city_name.title(),
                    "lat": lat,
                    "lon": lon,
                    "nearest_facility_km": None,
                }
            )
            continue
        nearest = min(haversine_km(lat, lon, fc[0], fc[1]) for fc in fac_coords)
        if nearest > radius_km:
            cold_spots.append(
                {
                    "city": city_name.title(),
                    "lat": lat,
                    "lon": lon,
                    "nearest_facility_km": round(nearest, 2),
                }
            )

    cold_spots.sort(key=lambda x: x.get("nearest_facility_km") or 9999, reverse=True)
    return cold_spots
