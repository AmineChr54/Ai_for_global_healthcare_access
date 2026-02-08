"""
Medical Specialty Hierarchy — bridges user language to dataset taxonomy.

Replaces fdr.config.medical_specialties with a self-contained hierarchy.
Used by the Query Planner to expand terms like "heart surgery" →
["cardiacSurgery", "cardiothoracic", "CABG", "PCI", "valve replacement"].
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field as dc_field
from typing import Dict, List, Optional, Union

logger = logging.getLogger(__name__)

# ── Hierarchy: Level 0 → Level 1 → Level 2 ─────────────────────────────────
MEDICAL_HIERARCHY: Dict[str, Union[Dict, List]] = {
    "internalMedicine": {
        "cardiology": ["interventionalCardiology", "electrophysiology", "heartFailureAndTransplant"],
        "endocrinologyAndDiabetesAndMetabolism": [],
        "gastroenterology": ["hepatology"],
        "geriatricsInternalMedicine": [],
        "hematology": [],
        "infectiousDiseases": [],
        "nephrology": ["dialysis"],
        "pulmonology": ["sleepMedicine"],
        "rheumatology": [],
        "medicalOncology": [],
        "hospiceAndPalliativeInternalMedicine": [],
        "globalHealthAndInternationalHealth": [],
    },
    "generalSurgery": {
        "colorectalSurgery": [],
        "cardiacSurgery": [],
        "thoracicSurgery": [],
        "vascularSurgery": [],
        "pediatricSurgery": [],
        "transplantSurgery": [],
        "traumaSurgery": [],
        "surgicalOncology": [],
        "bariatricSurgery": [],
    },
    "pediatrics": {
        "neonatologyPerinatalMedicine": [],
        "pediatricCardiology": [],
        "pediatricEndocrinology": [],
        "pediatricGastroenterology": [],
        "pediatricHematologyOncology": [],
        "pediatricInfectiousDiseases": [],
        "pediatricNephrology": [],
        "pediatricPulmonology": [],
        "pediatricNeurology": [],
    },
    "gynecologyAndObstetrics": {
        "maternalFetalMedicineOrPerinatology": [],
        "reproductiveEndocrinologyAndInfertility": [],
        "gynecologicOncology": [],
        "urogynecology": [],
    },
    "orthopedicSurgery": {
        "sportsOrthopedics": [],
        "spinalSurgery": [],
        "jointReplacement": [],
        "pediatricOrthopedics": [],
        "orthopedicTrauma": [],
    },
    "neurology": {
        "strokeNeurology": [],
        "epilepsy": [],
        "movementDisorders": [],
        "neuromuscularDiseases": [],
    },
    "neurosurgery": {
        "spinalNeurosurgery": [],
        "pediatricNeurosurgery": [],
        "neuroOncology": [],
    },
    "ophthalmology": {
        "retinaAndVitreous": [],
        "glaucoma": [],
        "cornea": [],
        "pediatricOphthalmology": [],
        "oculoplastics": [],
    },
    "otolaryngology": {
        "headAndNeckSurgery": [],
        "otology": [],
        "rhinology": [],
        "pediatricOtolaryngology": [],
    },
    "urology": {
        "pediatricUrology": [],
        "urologicOncology": [],
        "femaleUrology": [],
    },
    "dermatology": {"dermatopathology": [], "pediatricDermatology": []},
    "psychiatry": {
        "childAndAdolescentPsychiatry": [],
        "addictionPsychiatry": [],
        "geriatricPsychiatry": [],
        "forensicPsychiatry": [],
    },
    "radiology": {
        "interventionalRadiology": [],
        "neuroradiology": [],
        "nuclearMedicine": [],
    },
    "anesthesia": {
        "painMedicine": [],
        "criticalCareMedicine": [],
        "obstetricAnesthesiology": [],
        "pediatricAnesthesiology": [],
    },
    "emergencyMedicine": {"pediatricEmergencyMedicine": [], "toxicology": []},
    "pathology": {
        "clinicalPathology": [],
        "anatomicalPathology": [],
        "molecularPathology": [],
    },
    "physicalMedicineAndRehabilitation": {
        "spinalCordInjury": [],
        "brainInjury": [],
        "pediatricRehabilitation": [],
    },
    "familyMedicine": {},
    "plasticSurgery": {
        "craniofacialSurgery": [],
        "handSurgery": [],
        "microsurgery": [],
        "burnSurgery": [],
    },
    "dentistry": {
        "orthodontics": [],
        "oralAndMaxillofacialSurgery": [],
        "endodontics": [],
        "periodontics": [],
        "prosthodontics": [],
        "pediatricDentistry": [],
    },
    "publicHealth": {
        "socialAndBehavioralSciences": [],
        "epidemiology": [],
        "environmentalHealth": [],
    },
}


# ── User term → canonical specialty mapping ─────────────────────────────────
TERM_TO_SPECIALTY: Dict[str, List[str]] = {
    # Cardio / Cardiovascular
    "heart surgery": ["cardiacSurgery"],
    "cardiac surgery": ["cardiacSurgery"],
    "cardiovascular surgery": ["cardiacSurgery", "cardiology", "vascularSurgery"],
    "cardiovascular surgeries": ["cardiacSurgery", "cardiology", "vascularSurgery"],
    "cardiovascular": ["cardiology", "cardiacSurgery", "vascularSurgery"],
    "heart": ["cardiology"],
    "cardiology": ["cardiology"],
    "cardiac": ["cardiology", "cardiacSurgery"],
    "CABG": ["cardiacSurgery"],
    "PCI": ["interventionalCardiology", "cardiology"],
    "valve replacement": ["cardiacSurgery"],
    "cardiothoracic": ["cardiacSurgery", "thoracicSurgery"],
    "pacemaker": ["cardiology", "electrophysiology"],
    "echocardiography": ["cardiology"],
    "ECG": ["cardiology"],
    "electrocardiogram": ["cardiology"],
    "angioplasty": ["interventionalCardiology", "cardiology"],
    "stent": ["interventionalCardiology", "cardiology"],
    "blood pressure": ["cardiology", "internalMedicine"],
    "hypertension": ["cardiology", "internalMedicine"],
    "vascular": ["vascularSurgery"],
    # Eye
    "ophthalmology": ["ophthalmology"],
    "eye surgery": ["ophthalmology"],
    "eye care": ["ophthalmology"],
    "eye": ["ophthalmology"],
    "cataract": ["ophthalmology"],
    "cataract surgery": ["ophthalmology"],
    "glaucoma": ["ophthalmology", "glaucoma"],
    "retina": ["ophthalmology", "retinaAndVitreous"],
    "corneal transplant": ["ophthalmology", "cornea"],
    "LASIK": ["ophthalmology"],
    # Surgical
    "surgery": ["generalSurgery"],
    "surgeries": ["generalSurgery"],
    "surgical": ["generalSurgery"],
    "neurology": ["neurology"],
    "neurological": ["neurology"],
    "dermatology": ["dermatology"],
    "skin": ["dermatology"],
    "urology": ["urology"],
    "urological": ["urology"],
    "gastroenterology": ["gastroenterology"],
    "gastrointestinal": ["gastroenterology"],
    "digestive": ["gastroenterology"],
    "nephrology": ["nephrology"],
    "pulmonology": ["pulmonology"],
    "respiratory": ["pulmonology"],
    "lung": ["pulmonology"],
    "hematology": ["hematology"],
    "blood disorder": ["hematology"],
    "rheumatology": ["rheumatology"],
    "arthritis": ["rheumatology"],
    "orthopedic": ["orthopedicSurgery"],
    "orthopaedic": ["orthopedicSurgery"],
    "orthopedics": ["orthopedicSurgery"],
    "bone": ["orthopedicSurgery"],
    "hip replacement": ["orthopedicSurgery", "jointReplacement"],
    "knee replacement": ["orthopedicSurgery", "jointReplacement"],
    "fracture": ["orthopedicSurgery", "orthopedicTrauma"],
    "neurosurgery": ["neurosurgery"],
    "brain surgery": ["neurosurgery"],
    "plastic surgery": ["plasticSurgery"],
    "cleft": ["plasticSurgery", "craniofacialSurgery"],
    "burn": ["plasticSurgery", "burnSurgery"],
    # OB-GYN
    "maternity": ["gynecologyAndObstetrics"],
    "obstetrics": ["gynecologyAndObstetrics"],
    "gynecology": ["gynecologyAndObstetrics"],
    "gynaecology": ["gynecologyAndObstetrics"],
    "C-section": ["gynecologyAndObstetrics"],
    "cesarean": ["gynecologyAndObstetrics"],
    "caesarean": ["gynecologyAndObstetrics"],
    "pregnancy": ["gynecologyAndObstetrics"],
    "prenatal": ["gynecologyAndObstetrics"],
    "antenatal": ["gynecologyAndObstetrics"],
    "postnatal": ["gynecologyAndObstetrics"],
    "IVF": ["gynecologyAndObstetrics", "reproductiveEndocrinologyAndInfertility"],
    "fertility": ["gynecologyAndObstetrics", "reproductiveEndocrinologyAndInfertility"],
    # Pediatrics
    "pediatrics": ["pediatrics"],
    "paediatrics": ["pediatrics"],
    "pediatric": ["pediatrics"],
    "paediatric": ["pediatrics"],
    "pediatric care": ["pediatrics"],
    "child health": ["pediatrics"],
    "children's health": ["pediatrics"],
    "child care": ["pediatrics"],
    "neonatal": ["pediatrics", "neonatologyPerinatalMedicine"],
    "NICU": ["pediatrics", "neonatologyPerinatalMedicine"],
    "newborn": ["pediatrics", "neonatologyPerinatalMedicine"],
    # Internal medicine
    "internal medicine": ["internalMedicine"],
    "general medicine": ["internalMedicine"],
    "diabetes": ["endocrinologyAndDiabetesAndMetabolism", "internalMedicine"],
    "endocrinology": ["endocrinologyAndDiabetesAndMetabolism"],
    "thyroid": ["endocrinologyAndDiabetesAndMetabolism"],
    "kidney": ["nephrology"],
    "renal": ["nephrology"],
    "dialysis": ["nephrology", "dialysis"],
    "liver": ["gastroenterology", "hepatology"],
    "cancer": ["medicalOncology"],
    "oncology": ["medicalOncology"],
    "chemotherapy": ["medicalOncology"],
    "tumor": ["medicalOncology"],
    "tumour": ["medicalOncology"],
    "HIV": ["infectiousDiseases"],
    "AIDS": ["infectiousDiseases"],
    "tuberculosis": ["infectiousDiseases", "pulmonology"],
    "TB": ["infectiousDiseases", "pulmonology"],
    "malaria": ["infectiousDiseases"],
    "infectious disease": ["infectiousDiseases"],
    # Emergency / Trauma
    "emergency": ["emergencyMedicine"],
    "trauma": ["criticalCareMedicine", "emergencyMedicine"],
    "ICU": ["criticalCareMedicine"],
    "intensive care": ["criticalCareMedicine"],
    "critical care": ["criticalCareMedicine"],
    # Dental
    "dental": ["dentistry"],
    "dentistry": ["dentistry"],
    "teeth": ["dentistry"],
    "tooth": ["dentistry"],
    "orthodontics": ["dentistry", "orthodontics"],
    "oral surgery": ["dentistry", "oralAndMaxillofacialSurgery"],
    # ENT
    "ENT": ["otolaryngology"],
    "ear nose throat": ["otolaryngology"],
    "ear nose and throat": ["otolaryngology"],
    # Mental health
    "psychiatry": ["psychiatry"],
    "mental health": ["psychiatry"],
    "depression": ["psychiatry"],
    "anxiety": ["psychiatry"],
    # Rehab
    "rehabilitation": ["physicalMedicineAndRehabilitation"],
    "physiotherapy": ["physicalMedicineAndRehabilitation"],
    "physical therapy": ["physicalMedicineAndRehabilitation"],
    # Imaging
    "radiology": ["radiology"],
    "MRI": ["radiology"],
    "CT scan": ["radiology"],
    "X-ray": ["radiology"],
    "ultrasound": ["radiology"],
    "imaging": ["radiology"],
    "scan": ["radiology"],
    # Pathology
    "pathology": ["pathology"],
    "laboratory": ["pathology"],
    "lab test": ["pathology"],
    # Palliative
    "palliative": ["hospiceAndPalliativeInternalMedicine"],
    "hospice": ["hospiceAndPalliativeInternalMedicine"],
    "end of life": ["hospiceAndPalliativeInternalMedicine"],
    # Anesthesia
    "anesthesia": ["anesthesia"],
    "anesthesiology": ["anesthesia"],
    "anaesthesia": ["anesthesia"],
    # Family medicine
    "family medicine": ["familyMedicine"],
    "general practice": ["familyMedicine"],
    "GP": ["familyMedicine"],
    # Public health
    "public health": ["publicHealth"],
    "community health": ["publicHealth"],
    "epidemiology": ["publicHealth", "epidemiology"],
}


def flatten_specialties_to_level(
    hierarchy: Dict, max_level: int, _current_level: int = 0
) -> List[str]:
    """Flatten the hierarchy to a list of specialty names up to max_level."""
    result: List[str] = []
    for key, value in hierarchy.items():
        result.append(key)
        if _current_level < max_level and isinstance(value, dict):
            result.extend(flatten_specialties_to_level(value, max_level, _current_level + 1))
        elif _current_level < max_level and isinstance(value, list):
            result.extend(value)
    return result


def _normalize_query(query: str) -> str:
    """Normalize the query for better matching (handle plurals, common variations)."""
    q = query.lower()
    # We don't want to do aggressive stemming — just handle common plural forms
    # that prevent direct substring matching. The actual matching is done
    # against the TERM_TO_SPECIALTY keys which already include common variants.
    return q


# ── Trace dataclass for IDP demo ─────────────────────────────────────────────


@dataclass
class TermMapping:
    """One mapping trace entry: input_term → matched_key → specialties."""

    input_term: str
    matched_key: str
    match_type: str  # "exact" | "stem" | "fuzzy"
    confidence: float  # 0.0 – 1.0
    mapped_specialties: List[str] = dc_field(default_factory=list)


# Pre-sorted term keys (longest first) for consistent matching order.
_SORTED_TERM_KEYS = sorted(TERM_TO_SPECIALTY.keys(), key=len, reverse=True)


def _stem_query(query_lower: str) -> str:
    """Simple English suffix stripping for plural → singular."""
    words = query_lower.split()
    stemmed: List[str] = []
    for w in words:
        if w.endswith("ies") and len(w) > 4:
            stemmed.append(w[:-3] + "y")  # surgeries → surgery
        elif w.endswith("es") and len(w) > 3:
            stemmed.append(w[:-2])
        elif w.endswith("s") and len(w) > 3 and not w.endswith("ss"):
            stemmed.append(w[:-1])
        stemmed.append(w)
    return " ".join(stemmed)


def _fuzzy_match_terms(query_lower: str, threshold: int = 78) -> List[TermMapping]:
    """Use rapidfuzz to fuzzy-match query words against TERM_TO_SPECIALTY keys.

    Returns TermMapping entries for each fuzzy hit above *threshold*.
    """
    try:
        from rapidfuzz import fuzz, process
    except ImportError:
        logger.debug("rapidfuzz not installed — skipping fuzzy matching")
        return []

    mappings: List[TermMapping] = []
    already_mapped: set = set()

    # Try the full query first
    match = process.extractOne(query_lower, _SORTED_TERM_KEYS, scorer=fuzz.partial_ratio)
    if match and match[1] >= threshold:
        key = match[0]
        specs = TERM_TO_SPECIALTY[key]
        mappings.append(TermMapping(
            input_term=query_lower,
            matched_key=key,
            match_type="fuzzy",
            confidence=round(match[1] / 100.0, 2),
            mapped_specialties=list(specs),
        ))
        already_mapped.update(specs)

    # Also try individual words / bigrams for multi-word queries
    words = query_lower.split()
    chunks = list(words)
    for i in range(len(words) - 1):
        chunks.append(f"{words[i]} {words[i + 1]}")

    for chunk in chunks:
        if len(chunk) < 3:
            continue
        match = process.extractOne(chunk, _SORTED_TERM_KEYS, scorer=fuzz.ratio)
        if match and match[1] >= threshold:
            key = match[0]
            specs = TERM_TO_SPECIALTY[key]
            new_specs = [s for s in specs if s not in already_mapped]
            if new_specs:
                mappings.append(TermMapping(
                    input_term=chunk,
                    matched_key=key,
                    match_type="fuzzy",
                    confidence=round(match[1] / 100.0, 2),
                    mapped_specialties=new_specs,
                ))
                already_mapped.update(new_specs)

    return mappings


def expand_medical_terms(query: str) -> List[str]:
    """Expand user terms to canonical specialty names found in the dataset.

    Uses multi-pass matching:
    1. Exact substring match (term found in query)
    2. Stemmed substring match
    3. Fuzzy match via rapidfuzz (if installed)
    """
    _, specialties = expand_medical_terms_with_trace(query)
    return specialties


def expand_medical_terms_with_trace(query: str) -> tuple[List[TermMapping], List[str]]:
    """Same as expand_medical_terms but also returns the mapping trace.

    Returns:
        (trace, specialties) — trace is a list of TermMapping objects
        showing how each input fragment was mapped to canonical specialties.
    """
    query_lower = _normalize_query(query)
    matched: set = set()
    trace: List[TermMapping] = []

    # ── Pass 1: exact substring match (longest first) ────────────────────
    for term in _SORTED_TERM_KEYS:
        if term.lower() in query_lower:
            specs = TERM_TO_SPECIALTY[term]
            new_specs = [s for s in specs if s not in matched]
            if new_specs:
                trace.append(TermMapping(
                    input_term=query_lower,
                    matched_key=term,
                    match_type="exact",
                    confidence=1.0,
                    mapped_specialties=new_specs,
                ))
                matched.update(specs)

    # ── Pass 2: stemmed substring match ──────────────────────────────────
    if not matched:
        stemmed_query = _stem_query(query_lower)
        for term in _SORTED_TERM_KEYS:
            if term.lower() in stemmed_query:
                specs = TERM_TO_SPECIALTY[term]
                new_specs = [s for s in specs if s not in matched]
                if new_specs:
                    trace.append(TermMapping(
                        input_term=query_lower,
                        matched_key=term,
                        match_type="stem",
                        confidence=0.9,
                        mapped_specialties=new_specs,
                    ))
                    matched.update(specs)

    # ── Pass 3: fuzzy match via rapidfuzz ────────────────────────────────
    if not matched:
        fuzzy_mappings = _fuzzy_match_terms(query_lower)
        for fm in fuzzy_mappings:
            new_specs = [s for s in fm.mapped_specialties if s not in matched]
            if new_specs:
                fm.mapped_specialties = new_specs
                trace.append(fm)
                matched.update(new_specs)

    return trace, sorted(matched)


def get_all_specialties() -> List[str]:
    """Flat list of all specialty names (levels 0 and 1)."""
    return flatten_specialties_to_level(MEDICAL_HIERARCHY, 1)
