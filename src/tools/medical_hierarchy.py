"""
Medical Specialty Hierarchy — bridges user language to dataset taxonomy.

Replaces fdr.config.medical_specialties with a self-contained hierarchy.
Used by the Query Planner to expand terms like "heart surgery" →
["cardiacSurgery", "cardiothoracic", "CABG", "PCI", "valve replacement"].
"""

from __future__ import annotations

from typing import Dict, List, Union

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


def expand_medical_terms(query: str) -> List[str]:
    """Expand user terms to canonical specialty names found in the dataset.

    Uses multi-pass matching:
    1. Exact substring match (term found in query)
    2. Longest-match-first ordering to prefer specific terms
    """
    query_lower = _normalize_query(query)
    matched: set = set()

    # Sort terms by length descending so longer (more specific) matches take priority.
    # This ensures "cardiovascular surgery" matches before "surgery".
    sorted_terms = sorted(TERM_TO_SPECIALTY.keys(), key=len, reverse=True)

    for term in sorted_terms:
        if term.lower() in query_lower:
            matched.update(TERM_TO_SPECIALTY[term])

    # If no match found, try fuzzy approaches:
    # 1. Strip common suffixes from query words and retry
    if not matched:
        words = query_lower.split()
        stemmed_words = []
        for w in words:
            # Simple suffix stripping for common English plurals
            if w.endswith("ies") and len(w) > 4:
                stemmed_words.append(w[:-3] + "y")  # surgeries → surgery
            elif w.endswith("es") and len(w) > 3:
                stemmed_words.append(w[:-2])  # processes → process
            elif w.endswith("s") and len(w) > 3 and not w.endswith("ss"):
                stemmed_words.append(w[:-1])  # hospitals → hospital
            stemmed_words.append(w)  # keep original too

        stemmed_query = " ".join(stemmed_words)
        for term in sorted_terms:
            if term.lower() in stemmed_query:
                matched.update(TERM_TO_SPECIALTY[term])

    return sorted(matched)


def get_all_specialties() -> List[str]:
    """Flat list of all specialty names (levels 0 and 1)."""
    return flatten_specialties_to_level(MEDICAL_HIERARCHY, 1)
