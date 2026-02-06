"""Plan management endpoints ported from the PhotonFlux add-on."""
from __future__ import annotations

import math
import uuid
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .storage import get_collection_key, set_collection_key

router = APIRouter(prefix="/api/plans", tags=["plans"])

CultivarLiteral = Literal["wedding_cake", "blue_dream", "amnesia_haze"]
SubstrateLiteral = Literal["coco", "soil", "rockwool"]

NUTRIENT_KEYS = ["N", "P", "K", "Ca", "Mg", "S", "Na", "Fe", "B", "Mo", "Mn", "Zn", "Cu", "Cl"]
DEFAULT_WATER_PROFILE: Dict[str, float] = {
    "N": 0.05 * 14.0067 / 18.038,
    "Ca": 65.8,
    "Mg": 31.8,
    "K": 1.8,
    "Na": 7.8,
    "Cl": 18.0,
    "S": 70.43,
    "Fe": 0.01,
    "Mn": 0.01,
}
DEFAULT_OSMOSIS_SHARES: Dict[SubstrateLiteral, float] = {
    "rockwool": 0.30,
    "coco": 0.40,
    "soil": 0.20,
}

PLANS_COLLECTION = "plans"
CUSTOM_PLANS_KEY = "customPlans"
ACTIVE_PLAN_KEY = "activePlanIds"
DEFAULT_OVERRIDE_KEY = "defaultPlanOverrides"
EDITABLE_DEFAULT_CULTIVARS: set[str] = {"blue_dream", "amnesia_haze"}


class PlanEntryPayload(BaseModel):
    phase: str
    A: float = 0.0
    X: float = Field(0.0, description="Formerly B in VEG, C otherwise")
    BZ: float = 0.0
    pH: str = ""
    EC: str = ""
    Tide: Optional[float] = None
    Helix: Optional[float] = None
    Ligand: Optional[float] = None
    Silicate: Optional[float] = None
    SilicateUnit: Optional[Literal["per_liter", "per_plant"]] = None
    durationDays: Optional[int] = 7
    notes: Optional[List[str]] = None


class NutrientProfilePayload(BaseModel):
    N: Optional[float] = None
    P: Optional[float] = None
    K: Optional[float] = None
    Ca: Optional[float] = None
    Mg: Optional[float] = None
    S: Optional[float] = None
    Na: Optional[float] = None
    Fe: Optional[float] = None
    B: Optional[float] = None
    Mo: Optional[float] = None
    Mn: Optional[float] = None
    Zn: Optional[float] = None
    Cu: Optional[float] = None
    Cl: Optional[float] = None


class ManagedPlanPayload(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    plan: List[PlanEntryPayload]
    waterProfile: Optional[NutrientProfilePayload] = None
    osmosisShare: Optional[float] = None
    isDefault: Optional[bool] = False


class PlanMutationPayload(BaseModel):
    cultivar: CultivarLiteral
    substrate: SubstrateLiteral
    plan: ManagedPlanPayload


class ActivePlanPayload(BaseModel):
    cultivar: CultivarLiteral
    substrate: SubstrateLiteral
    planId: str


def _round2(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _clone_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [deepcopy(entry) for entry in entries]


BASE_PLAN_TEMPLATES: Dict[SubstrateLiteral, Dict[str, Any]] = {
    "coco": {
        "id": "default",
        "name": "Default Plan",
        "description": "PhotonFlux baseline schedule for coco.",
        "plan": _clone_entries([
            {"phase": "Early Veg", "A": 0.8, "X": 0.8, "BZ": 0.00, "pH": "5.7–5.9", "EC": "1.7", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 4},
            {"phase": "Mid Veg", "A": 1.0, "X": 1.0, "BZ": 0.00, "pH": "5.7–5.9", "EC": "1.9", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "Silicate": 4, "SilicateUnit": "per_plant", "notes": ["silicate_mid_veg_note"], "durationDays": 5},
            {"phase": "Late Veg", "A": 1.2, "X": 1.2, "BZ": 0.00, "pH": "5.7–5.9", "EC": "2.2", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 6},
            {"phase": "W1", "A": 1.4, "X": 1.0, "BZ": 0.00, "pH": "5.7–5.9", "EC": "2.4", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 9},
            {"phase": "W2", "A": 1.4, "X": 1.1, "BZ": 0.00, "pH": "5.7–5.9", "EC": "2.6", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 9},
            {"phase": "W3", "A": 1.3, "X": 1.3, "BZ": 0.00, "pH": "5.7–5.9", "EC": "2.8", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 9},
            {"phase": "W4", "A": 1.2, "X": 1.5, "BZ": 0.00, "pH": "5.7–5.9", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 5},
            {"phase": "W5", "A": 1.2, "X": 1.6, "BZ": 0.1, "pH": "5.7–5.9", "EC": "3.1", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 5},
            {"phase": "W6", "A": 1.1, "X": 1.5, "BZ": 0.3, "pH": "5.7–5.9", "EC": "3.1", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 5},
            {"phase": "W7", "A": 0.9, "X": 1.3, "BZ": 0.5, "pH": "5.7–5.9", "EC": "2.9", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W8", "A": 0.7, "X": 1.1, "BZ": 0.8, "pH": "5.7–5.9", "EC": "2.7", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W9", "A": 0.5, "X": 0.8, "BZ": 1.00, "pH": "5.7–5.9", "EC": "2.5", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 10},
            {"phase": "W10", "A": 0.00, "X": 0.5, "BZ": 1.30, "pH": "5.7–5.9", "EC": "2.2", "Tide": 0.00, "Helix": 0.00, "Ligand": 0.00, "durationDays": 10},
        ]),
        "waterProfile": deepcopy(DEFAULT_WATER_PROFILE),
        "osmosisShare": DEFAULT_OSMOSIS_SHARES["coco"],
        "isDefault": True,
    },
    "soil": {
        "id": "default",
        "name": "Default Plan",
        "description": "PhotonFlux baseline schedule for soil.",
        "plan": _clone_entries([
            {"phase": "Early Veg", "A": 0.7, "X": 0.25, "BZ": 0.00, "pH": "5.8–6.2", "EC": "1.7", "Tide": 0.20, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "Mid Veg", "A": 0.9, "X": 0.28, "BZ": 0.00, "pH": "5.8–6.2", "EC": "1.9", "Tide": 0.20, "Helix": 0.02, "Ligand": 0.02, "Silicate": 4, "SilicateUnit": "per_plant", "notes": ["silicate_mid_veg_note"], "durationDays": 7},
            {"phase": "Late Veg", "A": 1.1, "X": 0.31, "BZ": 0.00, "pH": "5.8–6.2", "EC": "2.2", "Tide": 0.20, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W1", "A": 1.23, "X": 0.35, "BZ": 0.10, "pH": "5.8–6.2", "EC": "2.4", "Tide": 0.20, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W2", "A": 1.32, "X": 0.35, "BZ": 0.17, "pH": "5.8–6.2", "EC": "2.6", "Tide": 0.20, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W3", "A": 1.32, "X": 0.35, "BZ": 0.23, "pH": "5.8–6.2", "EC": "2.8", "Tide": 0.20, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W4", "A": 1.32, "X": 0.46, "BZ": 0.21, "pH": "5.8–6.2", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W5", "A": 1.19, "X": 0.46, "BZ": 0.21, "pH": "5.8–6.2", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W6", "A": 1.19, "X": 0.46, "BZ": 0.21, "pH": "5.8–6.2", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W7", "A": 1.02, "X": 0.58, "BZ": 0.09, "pH": "5.8–6.2", "EC": "2.8", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W8", "A": 0.80, "X": 0.52, "BZ": 0.09, "pH": "5.8–6.2", "EC": "2.6", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W9", "A": 0.58, "X": 0.45, "BZ": 0.06, "pH": "5.8–6.2", "EC": "1.6", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W10", "A": 0.00, "X": 0.36, "BZ": 0.00, "pH": "5.8–6.2", "EC": "1.0", "Tide": 0.00, "Helix": 0.00, "Ligand": 0.00, "durationDays": 7},
        ]),
        "waterProfile": deepcopy(DEFAULT_WATER_PROFILE),
        "osmosisShare": DEFAULT_OSMOSIS_SHARES["soil"],
        "isDefault": True,
    },
    "rockwool": {
        "id": "default",
        "name": "Default Plan",
        "description": "PhotonFlux baseline schedule for rockwool.",
        "plan": _clone_entries([
            {"phase": "Early Veg", "A": 0.7, "X": 0.25, "BZ": 0.00, "pH": "5.6–5.8", "EC": "1.7", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "Mid Veg", "A": 0.9, "X": 0.28, "BZ": 0.00, "pH": "5.6–5.8", "EC": "1.9", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "Silicate": 4, "SilicateUnit": "per_plant", "notes": ["silicate_mid_veg_note"], "durationDays": 7},
            {"phase": "Late Veg", "A": 1.1, "X": 0.31, "BZ": 0.00, "pH": "5.6–5.8", "EC": "2.2", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W1", "A": 1.23, "X": 0.35, "BZ": 0.06, "pH": "5.6–5.8", "EC": "2.4", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W2", "A": 1.32, "X": 0.35, "BZ": 0.12, "pH": "5.6–5.8", "EC": "2.6", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W3", "A": 1.32, "X": 0.35, "BZ": 0.18, "pH": "5.6–5.8", "EC": "2.8", "Tide": 0.30, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W4", "A": 1.32, "X": 0.46, "BZ": 0.21, "pH": "5.6–5.8", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W5", "A": 1.18, "X": 0.46, "BZ": 0.21, "pH": "5.6–5.8", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W6", "A": 1.18, "X": 0.46, "BZ": 0.21, "pH": "5.6–5.8", "EC": "3.0", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W7", "A": 1.00, "X": 0.58, "BZ": 0.07, "pH": "5.6–5.8", "EC": "2.8", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W8", "A": 0.85, "X": 0.52, "BZ": 0.07, "pH": "5.6–5.8", "EC": "2.6", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W9", "A": 0.63, "X": 0.45, "BZ": 0.06, "pH": "5.6–5.8", "EC": "1.6", "Tide": 0.00, "Helix": 0.02, "Ligand": 0.02, "durationDays": 7},
            {"phase": "W10", "A": 0.00, "X": 0.45, "BZ": 0.00, "pH": "5.6–5.8", "EC": "1.0", "Tide": 0.00, "Helix": 0.00, "Ligand": 0.00, "durationDays": 7},
        ]),
        "waterProfile": deepcopy(DEFAULT_WATER_PROFILE),
        "osmosisShare": DEFAULT_OSMOSIS_SHARES["rockwool"],
        "isDefault": True,
    },
}


def _scale_plan_entries(template: Dict[str, Any], multipliers: Dict[str, float]) -> List[Dict[str, Any]]:
    veg = multipliers.get("veg", 1.0)
    bloom = multipliers.get("bloom", 1.0)
    ripen = multipliers.get("ripen", 1.0)
    scaled: List[Dict[str, Any]] = []
    for entry in template["plan"]:
        factor = veg
        if entry["phase"].startswith("W"):
            try:
                week = int(entry["phase"][1:])
                factor = ripen if week >= 9 else bloom
            except ValueError:
                factor = bloom
        normalized = deepcopy(entry)
        normalized["A"] = _round2(normalized.get("A", 0.0) * factor)
        normalized["X"] = _round2(normalized.get("X", 0.0) * factor)
        normalized["BZ"] = _round2(normalized.get("BZ", 0.0) * factor)
        scaled.append(normalized)
    return scaled


def _clone_plan_template(template: Dict[str, Any], overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    overrides = overrides or {}
    base_plan = overrides.get("plan", template["plan"])
    result = {
        **template,
        **overrides,
        "plan": _clone_entries(base_plan),
        "waterProfile": deepcopy(overrides.get("waterProfile") or template["waterProfile"]),
        "osmosisShare": overrides.get("osmosisShare", template["osmosisShare"]),
        "id": overrides.get("id", template["id"]),
        "isDefault": overrides.get("isDefault", template.get("isDefault", True)),
    }
    return result


def _create_cultivar_plan(overrides: Optional[Dict[SubstrateLiteral, Dict[str, Any]]] = None) -> Dict[SubstrateLiteral, Dict[str, Any]]:
    overrides = overrides or {}
    return {
        "coco": _clone_plan_template(BASE_PLAN_TEMPLATES["coco"], overrides.get("coco")),
        "soil": _clone_plan_template(BASE_PLAN_TEMPLATES["soil"], overrides.get("soil")),
        "rockwool": _clone_plan_template(BASE_PLAN_TEMPLATES["rockwool"], overrides.get("rockwool")),
    }


DEFAULT_PLAN: Dict[CultivarLiteral, Dict[SubstrateLiteral, Dict[str, Any]]] = {
    "wedding_cake": _create_cultivar_plan({
        "coco": {"description": "PhotonFlux baseline schedule for Wedding Cake on coco."},
        "soil": {"description": "PhotonFlux baseline schedule for Wedding Cake on soil."},
        "rockwool": {"description": "PhotonFlux baseline schedule for Wedding Cake on rockwool."},
    }),
    "blue_dream": _create_cultivar_plan({
        "coco": {
            "description": "Balanced feed plan tuned for Blue Dream in coco with a slight bloom emphasis.",
            "plan": _scale_plan_entries(BASE_PLAN_TEMPLATES["coco"], {"veg": 0.95, "bloom": 1.05, "ripen": 1}),
        },
        "soil": {
            "description": "Balanced feed plan tuned for Blue Dream in soil with a slight bloom emphasis.",
            "plan": _scale_plan_entries(BASE_PLAN_TEMPLATES["soil"], {"veg": 0.95, "bloom": 1.05, "ripen": 1}),
        },
        "rockwool": {
            "description": "Balanced feed plan tuned for Blue Dream in rockwool with a slight bloom emphasis.",
            "plan": _scale_plan_entries(BASE_PLAN_TEMPLATES["rockwool"], {"veg": 0.95, "bloom": 1.05, "ripen": 1}),
        },
    }),
    "amnesia_haze": _create_cultivar_plan({
        "coco": {
            "description": "Gentle feed schedule crafted for Amnesia Haze in coco to support long flowering.",
            "plan": _scale_plan_entries(BASE_PLAN_TEMPLATES["coco"], {"veg": 0.9, "bloom": 0.94, "ripen": 0.85}),
        },
        "soil": {
            "description": "Gentle feed schedule crafted for Amnesia Haze in soil to support long flowering.",
            "plan": _scale_plan_entries(BASE_PLAN_TEMPLATES["soil"], {"veg": 0.9, "bloom": 0.94, "ripen": 0.85}),
        },
        "rockwool": {
            "description": "Gentle feed schedule crafted for Amnesia Haze in rockwool to support long flowering.",
            "plan": _scale_plan_entries(BASE_PLAN_TEMPLATES["rockwool"], {"veg": 0.9, "bloom": 0.94, "ripen": 0.85}),
        },
    }),
}


def _combo_key(cultivar: CultivarLiteral, substrate: SubstrateLiteral) -> str:
    return f"{cultivar}_{substrate}"


def _ensure_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _ensure_list(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def _load_store_payload() -> Dict[str, Any]:
    return {
        CUSTOM_PLANS_KEY: _ensure_dict(get_collection_key(PLANS_COLLECTION, CUSTOM_PLANS_KEY, {})),
        ACTIVE_PLAN_KEY: _ensure_dict(get_collection_key(PLANS_COLLECTION, ACTIVE_PLAN_KEY, {})),
        DEFAULT_OVERRIDE_KEY: _ensure_dict(get_collection_key(PLANS_COLLECTION, DEFAULT_OVERRIDE_KEY, {})),
    }


def _save_store_payload(payload: Dict[str, Any]) -> None:
    set_collection_key(PLANS_COLLECTION, CUSTOM_PLANS_KEY, payload.get(CUSTOM_PLANS_KEY, {}))
    set_collection_key(PLANS_COLLECTION, ACTIVE_PLAN_KEY, payload.get(ACTIVE_PLAN_KEY, {}))
    set_collection_key(PLANS_COLLECTION, DEFAULT_OVERRIDE_KEY, payload.get(DEFAULT_OVERRIDE_KEY, {}))


def _sanitize_notes(notes: Optional[List[str]]) -> Optional[List[str]]:
    if not notes:
        return None
    cleaned = [note.strip() for note in notes if isinstance(note, str) and note.strip()]
    return cleaned or None


def _sanitize_duration(value: Optional[int]) -> int:
    if value is None:
        return 7
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return 7
    return max(1, numeric)


def _sanitize_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def _normalize_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {
        "phase": str(entry.get("phase") or ""),
        "A": float(entry.get("A") or 0.0),
        "X": float(entry.get("X") or 0.0),
        "BZ": float(entry.get("BZ") or 0.0),
        "pH": str(entry.get("pH") or ""),
        "EC": str(entry.get("EC") or ""),
        "Tide": _sanitize_float(entry.get("Tide")),
        "Helix": _sanitize_float(entry.get("Helix")),
        "Ligand": _sanitize_float(entry.get("Ligand")),
        "Silicate": _sanitize_float(entry.get("Silicate")),
        "SilicateUnit": entry.get("SilicateUnit") if entry.get("SilicateUnit") in {"per_liter", "per_plant"} else ("per_liter" if entry.get("Silicate") else None),
        "durationDays": _sanitize_duration(entry.get("durationDays")),
        "notes": _sanitize_notes(entry.get("notes")),
    }
    return normalized


def _sanitize_water_profile(data: Optional[Dict[str, Any]]) -> Dict[str, float]:
    profile = deepcopy(DEFAULT_WATER_PROFILE)
    if data:
        for key in NUTRIENT_KEYS:
            if key in data and data[key] is not None:
                numeric = _sanitize_float(data[key])
                if numeric is not None:
                    profile[key] = numeric
    return profile


def _clamp_share(value: Optional[float], substrate: SubstrateLiteral) -> float:
    numeric = value if isinstance(value, (int, float)) else None
    if numeric is None or not math.isfinite(float(numeric)):
        numeric = DEFAULT_OSMOSIS_SHARES.get(substrate, 0.0)
    clamped = max(0.0, min(1.0, float(numeric)))
    return clamped


def _generate_plan_id() -> str:
    return str(uuid.uuid4())


def _normalize_plan(plan_payload: ManagedPlanPayload, substrate: SubstrateLiteral, *, enforce_id: Optional[str] = None) -> Dict[str, Any]:
    plan_id = enforce_id or plan_payload.id or _generate_plan_id()
    normalized_entries = [_normalize_entry(entry.model_dump()) for entry in plan_payload.plan]
    return {
        "id": plan_id,
        "name": plan_payload.name.strip() or "Custom Plan",
        "description": (plan_payload.description or "").strip(),
        "plan": normalized_entries,
        "waterProfile": _sanitize_water_profile(plan_payload.waterProfile.model_dump() if plan_payload.waterProfile else None),
        "osmosisShare": _clamp_share(plan_payload.osmosisShare, substrate),
        "isDefault": bool(plan_payload.isDefault),
    }


def _get_default_plan(cultivar: CultivarLiteral, substrate: SubstrateLiteral) -> Dict[str, Any]:
    cultivar_plans = DEFAULT_PLAN.get(cultivar)
    if not cultivar_plans:
        raise HTTPException(status_code=404, detail=f"Unknown cultivar '{cultivar}'")
    template = deepcopy(cultivar_plans[substrate])
    overrides = _load_store_payload()[DEFAULT_OVERRIDE_KEY]
    if cultivar in EDITABLE_DEFAULT_CULTIVARS:
        override = overrides.get(_combo_key(cultivar, substrate))
        if override:
            template = _clone_plan_template(template, override)
    return template


def _list_custom_plans(cultivar: CultivarLiteral, substrate: SubstrateLiteral) -> List[Dict[str, Any]]:
    store = _load_store_payload()
    combo_key = _combo_key(cultivar, substrate)
    plans = _ensure_list(store[CUSTOM_PLANS_KEY].get(combo_key))
    return [_normalize_plan(ManagedPlanPayload(**plan), substrate, enforce_id=plan.get("id")) for plan in plans]


def _save_custom_plan(cultivar: CultivarLiteral, substrate: SubstrateLiteral, plan: Dict[str, Any]) -> Dict[str, Any]:
    payload = _load_store_payload()
    combo_key = _combo_key(cultivar, substrate)
    custom_plans = _ensure_list(payload[CUSTOM_PLANS_KEY].get(combo_key))
    idx = next((i for i, existing in enumerate(custom_plans) if existing.get("id") == plan["id"]), -1)
    if idx >= 0:
        custom_plans[idx] = plan
    else:
        custom_plans.append(plan)
    payload[CUSTOM_PLANS_KEY][combo_key] = custom_plans
    _save_store_payload(payload)
    return plan


def _delete_custom_plan(cultivar: CultivarLiteral, substrate: SubstrateLiteral, plan_id: str) -> bool:
    payload = _load_store_payload()
    combo_key = _combo_key(cultivar, substrate)
    custom_plans = _ensure_list(payload[CUSTOM_PLANS_KEY].get(combo_key))
    filtered = [plan for plan in custom_plans if plan.get("id") != plan_id]
    if len(filtered) == len(custom_plans):
        return False
    payload[CUSTOM_PLANS_KEY][combo_key] = filtered
    active_ids = payload[ACTIVE_PLAN_KEY]
    if active_ids.get(combo_key) == plan_id:
        active_ids[combo_key] = "default"
    _save_store_payload(payload)
    return True


def _get_active_plan_id(cultivar: CultivarLiteral, substrate: SubstrateLiteral) -> str:
    payload = _load_store_payload()
    return payload[ACTIVE_PLAN_KEY].get(_combo_key(cultivar, substrate), "default")


def _set_active_plan_id(cultivar: CultivarLiteral, substrate: SubstrateLiteral, plan_id: str) -> None:
    payload = _load_store_payload()
    payload[ACTIVE_PLAN_KEY][_combo_key(cultivar, substrate)] = plan_id
    _save_store_payload(payload)


def _get_available_plans(cultivar: CultivarLiteral, substrate: SubstrateLiteral) -> List[Dict[str, Any]]:
    default_plan = _get_default_plan(cultivar, substrate)
    custom_plans = _list_custom_plans(cultivar, substrate)
    return [default_plan, *custom_plans]


def _get_active_plan(cultivar: CultivarLiteral, substrate: SubstrateLiteral) -> Dict[str, Any]:
    active_id = _get_active_plan_id(cultivar, substrate)
    if active_id == "default":
        return _get_default_plan(cultivar, substrate)
    for plan in _list_custom_plans(cultivar, substrate):
        if plan["id"] == active_id:
            return plan
    _set_active_plan_id(cultivar, substrate, "default")
    return _get_default_plan(cultivar, substrate)


@router.get("/default")
def read_default_plan(cultivar: CultivarLiteral = Query(...), substrate: SubstrateLiteral = Query(...)):
    return _get_default_plan(cultivar, substrate)


@router.get("/custom")
def read_custom_plans(cultivar: CultivarLiteral = Query(...), substrate: SubstrateLiteral = Query(...)):
    return _list_custom_plans(cultivar, substrate)


@router.get("/available")
def read_available_plans(cultivar: CultivarLiteral = Query(...), substrate: SubstrateLiteral = Query(...)):
    return _get_available_plans(cultivar, substrate)


@router.get("/active")
def read_active_plan(cultivar: CultivarLiteral = Query(...), substrate: SubstrateLiteral = Query(...)):
    active_id = _get_active_plan_id(cultivar, substrate)
    return {"planId": active_id, "plan": _get_active_plan(cultivar, substrate)}


@router.post("/active")
def set_active_plan(payload: ActivePlanPayload):
    available_ids = {plan["id"] for plan in _get_available_plans(payload.cultivar, payload.substrate)}
    if payload.planId not in available_ids:
        raise HTTPException(status_code=404, detail=f"Plan '{payload.planId}' not found for combo")
    _set_active_plan_id(payload.cultivar, payload.substrate, payload.planId)
    return {"planId": payload.planId}


@router.put("/custom")
def upsert_plan(payload: PlanMutationPayload):
    plan_payload = payload.plan
    normalized = _normalize_plan(plan_payload, payload.substrate)
    plan_id = normalized["id"]
    if plan_id == "default":
        if payload.cultivar not in EDITABLE_DEFAULT_CULTIVARS:
            raise HTTPException(status_code=400, detail="Default plan is read-only for this cultivar")
        store_payload = _load_store_payload()
        store_payload[DEFAULT_OVERRIDE_KEY][_combo_key(payload.cultivar, payload.substrate)] = normalized
        _save_store_payload(store_payload)
        return normalized
    saved = _save_custom_plan(payload.cultivar, payload.substrate, normalized)
    return saved


@router.post("/custom")
def create_plan(payload: PlanMutationPayload):
    plan_payload = payload.plan
    plan_payload.id = plan_payload.id or _generate_plan_id()
    result = _save_custom_plan(payload.cultivar, payload.substrate, _normalize_plan(plan_payload, payload.substrate))
    return result


@router.delete("/custom/{plan_id}")
def delete_plan(cultivar: CultivarLiteral, substrate: SubstrateLiteral, plan_id: str):
    if plan_id == "default":
        if cultivar not in EDITABLE_DEFAULT_CULTIVARS:
            raise HTTPException(status_code=400, detail="Default plan is read-only for this cultivar")
        payload = _load_store_payload()
        combo_key = _combo_key(cultivar, substrate)
        overrides = payload[DEFAULT_OVERRIDE_KEY]
        if combo_key in overrides:
            del overrides[combo_key]
            _save_store_payload(payload)
        return {"deleted": True}
    deleted = _delete_custom_plan(cultivar, substrate, plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found")
    return {"deleted": True}
