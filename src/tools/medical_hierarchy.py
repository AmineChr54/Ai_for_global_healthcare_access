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
    # Cardio
    "heart surgery": ["cardiacSurgery"],
    "cardiac surgery": ["cardiacSurgery"],
    "heart": ["cardiology"],
    "cardiology": ["cardiology"],
    "CABG": ["cardiacSurgery"],
    "PCI": ["interventionalCardiology", "cardiology"],
    "valve replacement": ["cardiacSurgery"],
    "cardiothoracic": ["cardiacSurgery", "thoracicSurgery"],
    "pacemaker": ["cardiology", "electrophysiology"],
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
    "surgical": ["generalSurgery"],
    "neurology": ["neurology"],
    "dermatology": ["dermatology"],
    "urology": ["urology"],
    "gastroenterology": ["gastroenterology"],
    "nephrology": ["nephrology"],
    "pulmonology": ["pulmonology"],
    "hematology": ["hematology"],
    "rheumatology": ["rheumatology"],
    "orthopedic": ["orthopedicSurgery"],
    "orthopaedic": ["orthopedicSurgery"],
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
    "C-section": ["gynecologyAndObstetrics"],
    "cesarean": ["gynecologyAndObstetrics"],
    "IVF": ["gynecologyAndObstetrics", "reproductiveEndocrinologyAndInfertility"],
    # Pediatrics
    "pediatrics": ["pediatrics"],
    "pediatric": ["pediatrics"],
    "neonatal": ["pediatrics", "neonatologyPerinatalMedicine"],
    "NICU": ["pediatrics", "neonatologyPerinatalMedicine"],
    # Internal medicine
    "diabetes": ["endocrinologyAndDiabetesAndMetabolism", "internalMedicine"],
    "kidney": ["nephrology"],
    "dialysis": ["nephrology"],
    "liver": ["gastroenterology", "hepatology"],
    "cancer": ["medicalOncology"],
    "oncology": ["medicalOncology"],
    "chemotherapy": ["medicalOncology"],
    "HIV": ["infectiousDiseases"],
    "AIDS": ["infectiousDiseases"],
    "tuberculosis": ["infectiousDiseases", "pulmonology"],
    "TB": ["infectiousDiseases", "pulmonology"],
    "malaria": ["infectiousDiseases"],
    # Emergency / Trauma
    "emergency": ["emergencyMedicine"],
    "trauma": ["criticalCareMedicine", "emergencyMedicine"],
    "ICU": ["criticalCareMedicine"],
    "intensive care": ["criticalCareMedicine"],
    # Dental
    "dental": ["dentistry"],
    "dentistry": ["dentistry"],
    "orthodontics": ["dentistry", "orthodontics"],
    "oral surgery": ["dentistry", "oralAndMaxillofacialSurgery"],
    # ENT
    "ENT": ["otolaryngology"],
    # Mental health
    "psychiatry": ["psychiatry"],
    "mental health": ["psychiatry"],
    # Rehab
    "rehabilitation": ["physicalMedicineAndRehabilitation"],
    "physiotherapy": ["physicalMedicineAndRehabilitation"],
    # Imaging
    "radiology": ["radiology"],
    "MRI": ["radiology"],
    "CT scan": ["radiology"],
    "X-ray": ["radiology"],
    "ultrasound": ["radiology"],
    # Pathology
    "pathology": ["pathology"],
    "laboratory": ["pathology"],
    # Palliative
    "palliative": ["hospiceAndPalliativeInternalMedicine"],
    "hospice": ["hospiceAndPalliativeInternalMedicine"],
    # Anesthesia
    "anesthesia": ["anesthesia"],
    "anesthesiology": ["anesthesia"],
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


def expand_medical_terms(query: str) -> List[str]:
    """Expand user terms to canonical specialty names found in the dataset."""
    query_lower = query.lower()
    matched: set = set()
    for term, specialties in TERM_TO_SPECIALTY.items():
        if term.lower() in query_lower:
            matched.update(specialties)
    return sorted(matched)


def get_all_specialties() -> List[str]:
    """Flat list of all specialty names (levels 0 and 1)."""
    return flatten_specialties_to_level(MEDICAL_HIERARCHY, 1)
