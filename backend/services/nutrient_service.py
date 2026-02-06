"""PhotonFlux nutrient calculator ported for backend use."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable, Dict, List, Literal, Optional

# ---------------------------------------------------------------------------
# Constants cloned from photonflux build-frontend/constants.ts
# ---------------------------------------------------------------------------

TARGET_MIX_TOTAL = 1000.0
P_FROM_P2O5 = 0.4365
K_FROM_K2O = 0.8301
S_FROM_SO3 = 0.4
MKP_P2O5 = 0.52
MKP_K2O = 0.34
MAP_N = 0.12
MAP_P2O5 = 0.61
KNO3_N = 0.13
KNO3_K2O = 0.46
SOP_K2O = 0.50
SOP_SO3 = 0.45
EPSOM_MG = 0.0981
EPSOM_S = 0.1222
MMX = {"Fe": 0.078, "Mn": 0.026, "Zn": 0.013, "Cu": 0.005, "B": 0.007, "Mo": 0.0032}
FEEDTA_FE = 0.13
H3BO3_B = 0.1749
NA2MOO4_MO = 0.396
MGNITRATE_N = 0.11
MGNITRATE_MG = 0.096
CACALGG_N = 0.155
CACALGG_CA = 0.19

VECTOR_RECIPE_RAW = {
    "MgSO4": 240.8,
    "K2SO4": 232.4,
    "KNO3": 4.8,
    "MKP": 126.8,
    "MAP": 342.2,
    "MMX": 40.1,
    "FeEDTA": 8.0,
    "H3BO3": 4.6,
    "Na2MoO4": 0.2,
}

PULSE_RECIPE_RAW = {
    "MgSO4": 89.980965565,
    "K2SO4": 273.807463806,
    "KNO3": 0.0,
    "MKP": 180.019611236,
    "MMX": 24.9754859549,
    "FeEDTA": 5.01816923343,
    "H3BO3": 2.88400530657,
    "Na2MoO4": 0.115360212263,
}

VECTOR_NORMALIZATION = 1.0563
PULSE_NORMALIZATION = 1.7337
BURST_RECIPE = {"MKP": 0.60, "SOP": 0.39, "EPSOM": 0.025}

AMMONIUM_DETECTION_LIMIT = 0.05
NH4_TO_ELEMENTAL_N = 14.0067 / 18.038

DEFAULT_WATER_PROFILE = {
    "N": AMMONIUM_DETECTION_LIMIT * NH4_TO_ELEMENTAL_N,
    "Ca": 65.8,
    "Mg": 31.8,
    "K": 1.8,
    "Na": 7.8,
    "Cl": 18.0,
    "S": 70.43,
    "Fe": 0.01,
    "Mn": 0.01,
}

DEFAULT_OSMOSIS_SHARES = {
    "rockwool": 0.30,
    "coco": 0.40,
    "soil": 0.20,
}

REQUIRED_NUTRIENT_KEYS = ["N", "P", "K", "Ca", "Mg", "S", "Na", "Fe", "B", "Mo", "Mn", "Zn", "Cu", "Cl"]


# ---------------------------------------------------------------------------
# Recipe helpers
# ---------------------------------------------------------------------------

def _normalize_recipe(raw: Dict[str, float], scale: float, target: float = TARGET_MIX_TOTAL) -> Dict[str, float]:
    normalized: Dict[str, float] = {}
    total = 0.0
    for salt, grams in raw.items():
        amount = float(grams or 0.0) * scale
        if math.isfinite(amount) and amount > 0:
            normalized[salt] = amount
            total += amount
        else:
            normalized[salt] = 0.0
    if total <= 0.0:
        return {salt: 0.0 for salt in raw}
    adjust = target / total
    return {salt: grams * adjust for salt, grams in normalized.items()}


def _shares_from_normalized(normalized: Dict[str, float], target: float = TARGET_MIX_TOTAL) -> Dict[str, float]:
    divisor = target or 1.0
    return {salt: (grams or 0.0) / divisor for salt, grams in normalized.items()}


B_REC = _normalize_recipe(VECTOR_RECIPE_RAW, VECTOR_NORMALIZATION)
C_REC = _normalize_recipe(PULSE_RECIPE_RAW, PULSE_NORMALIZATION)


def _profile_from_recipe(recipe: Dict[str, float]) -> Dict[str, float]:
    profile = {key: 0.0 for key in REQUIRED_NUTRIENT_KEYS}
    shares = _shares_from_normalized(recipe)

    if shares.get("MgSO4"):
        mgso4 = shares["MgSO4"]
        profile["Mg"] += mgso4 * EPSOM_MG * 1000.0
        profile["S"] += mgso4 * EPSOM_S * 1000.0
    if shares.get("K2SO4"):
        k2so4 = shares["K2SO4"]
        profile["K"] += k2so4 * SOP_K2O * K_FROM_K2O * 1000.0
        profile["S"] += k2so4 * SOP_SO3 * S_FROM_SO3 * 1000.0
    if shares.get("KNO3"):
        kno3 = shares["KNO3"]
        profile["N"] += kno3 * KNO3_N * 1000.0
        profile["K"] += kno3 * KNO3_K2O * K_FROM_K2O * 1000.0
    if shares.get("MKP"):
        mkp = shares["MKP"]
        profile["P"] += mkp * MKP_P2O5 * P_FROM_P2O5 * 1000.0
        profile["K"] += mkp * MKP_K2O * K_FROM_K2O * 1000.0
    if shares.get("MAP"):
        map_share = shares["MAP"]
        profile["N"] += map_share * MAP_N * 1000.0
        profile["P"] += map_share * MAP_P2O5 * P_FROM_P2O5 * 1000.0
    if shares.get("MMX"):
        mmx_share = shares["MMX"]
        for nutrient, fraction in MMX.items():
            profile[nutrient] += mmx_share * fraction * 1000.0
    if shares.get("FeEDTA"):
        profile["Fe"] += shares["FeEDTA"] * FEEDTA_FE * 1000.0
    if shares.get("H3BO3"):
        profile["B"] += shares["H3BO3"] * H3BO3_B * 1000.0
    if shares.get("Na2MoO4"):
        profile["Mo"] += shares["Na2MoO4"] * NA2MOO4_MO * 1000.0
    return profile


PROF_A = {
    "N": (0.600 * CACALGG_N + 0.400 * MGNITRATE_N) * 1000.0,
    "Ca": (0.600 * CACALGG_CA) * 1000.0,
    "Mg": (0.400 * MGNITRATE_MG) * 1000.0,
}
PROF_B = _profile_from_recipe(B_REC)
PROF_C = _profile_from_recipe(C_REC)


def _profile_from_burst() -> Dict[str, float]:
    profile = {key: 0.0 for key in REQUIRED_NUTRIENT_KEYS}
    profile["P"] += BURST_RECIPE["MKP"] * MKP_P2O5 * P_FROM_P2O5 * 1000.0
    profile["K"] += BURST_RECIPE["MKP"] * MKP_K2O * K_FROM_K2O * 1000.0
    profile["K"] += BURST_RECIPE["SOP"] * SOP_K2O * K_FROM_K2O * 1000.0
    profile["S"] += BURST_RECIPE["SOP"] * SOP_SO3 * S_FROM_SO3 * 1000.0
    profile["Mg"] += BURST_RECIPE["EPSOM"] * EPSOM_MG * 1000.0
    profile["S"] += BURST_RECIPE["EPSOM"] * EPSOM_S * 1000.0
    return profile


PROF_BURST = _profile_from_burst()
PROF_TIDE = {"N": 0.01 * 1000.0, "K": 0.17 * K_FROM_K2O * 1000.0, "S": 0.01 * 1000.0, "Na": 0.025 * 1000.0}
PROF_HELIX = {"N": 0.10 * 1000.0}
PROF_LIGAND = {"N": 0.10 * 1000.0}
QUENCH_DOSE_G_L = 0.30
PROF_QUENCH = {"Ca": 0.2725 * 1000.0, "Cl": 0.4827 * 1000.0}


# ---------------------------------------------------------------------------
# Lightweight translation helpers (subset of photonflux I18N)
# ---------------------------------------------------------------------------

DEFAULT_PHASE_LABELS = {
    "Early Veg": "Early Veg",
    "Mid Veg": "Mid Veg",
    "Late Veg": "Late Veg",
    "W1": "W1",
    "W2": "W2",
    "W3": "W3",
    "W4": "W4",
    "W5": "W5",
    "W6": "W6",
    "W7": "W7",
    "W8": "W8",
    "W9": "W9",
    "W10": "W10",
}

DEFAULT_PHASE_TAGS = {
    "Early Veg": "Seedling",
    "Mid Veg": "Growth",
    "Late Veg": "Growth",
    "W1": "Transformation",
    "W2": "Early Flower",
    "W3": "Early Flower",
    "W4": "Bulking",
    "W5": "Bulking",
    "W6": "Bulking",
    "W7": "Bulking",
    "W8": "Bulking",
    "W9": "Ripen",
    "W10": "Ripen",
}

DEFAULT_TRANSLATIONS: Dict[str, Any] = {
    "A_name": "A (Calcium Nitrate)",
    "B_name": "B (N-P-K-Mg Salts)",
    "C_name": "C (P-K-S-Mg Salts)",
    "BURST_name": "BURST (PK Booster)",
    "silicate_name": "Silicate / Hypo",
    "per_plant_short": "plant",
    "no_A_ripen": "Not in ripen",
    "not_in_veg": "not in veg/ripen",
    "helix_pulse_note": "Helix additionally 1× weekly 0.3 ml/L for 24 h",
    "ripen_only_note": "Ripen only",
    "apply_per_plant": "Apply per plant",
    "phases": DEFAULT_PHASE_LABELS,
    "tags": DEFAULT_PHASE_TAGS,
}


def default_week_tag(phase: str, translations: Optional[Dict[str, Any]] = None) -> str:
    tags = (translations or DEFAULT_TRANSLATIONS).get("tags", {})
    return tags.get(phase, "")


# ---------------------------------------------------------------------------
# Domain dataclasses mirroring photonflux types.ts
# ---------------------------------------------------------------------------

Trend = Literal["neutral", "higher", "lower"]
YesNo = Literal["yes", "no"]
PHDrift = Literal["normal", "high", "low"]
StageClass = Literal["VEG", "B1", "P23", "P47", "W8", "RIPEN"]


@dataclass
class PlanEntry:
    phase: str
    A: float
    X: float
    BZ: float
    pH: str = ""
    EC: str = ""
    Tide: float = 0.0
    Helix: float = 0.0
    Ligand: float = 0.0
    Silicate: Optional[float] = None
    SilicateUnit: Literal["per_liter", "per_plant"] = "per_liter"
    durationDays: int = 7
    notes: List[str] = field(default_factory=list)


@dataclass
class ManagedPlan:
    id: str
    name: str
    plan: List[PlanEntry]
    water_profile: Dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WATER_PROFILE))
    osmosis_share: float = 0.0
    description: str = ""


@dataclass
class DoserInput:
    phase: str
    reservoir: float
    substrate: Literal["coco", "soil", "rockwool"]
    trend: Trend
    tipburn: YesNo
    pale: YesNo
    caMgDeficiency: YesNo
    claw: YesNo
    phDrift: PHDrift
    startDate: Optional[str] = None


@dataclass
class WeighRow:
    name: str
    amount: float
    unit: str
    note: str
    tagClass: str
    perPlant: bool = False

    def as_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "amount": self.amount,
            "unit": self.unit,
            "note": self.note,
            "tagClass": self.tagClass,
            "perPlant": self.perPlant,
        }


@dataclass
class CalculationResult:
    baseLabel: str
    baseValues: Dict[str, Any]
    deltaValues: Dict[str, Any]
    adjustedValues: Dict[str, Any]
    weighTable: List[WeighRow]
    ppm: Dict[str, float]
    npkRatio: str
    stageClass: StageClass

    def as_dict(self) -> Dict[str, Any]:
        return {
            "baseLabel": self.baseLabel,
            "baseValues": self.baseValues,
            "deltaValues": self.deltaValues,
            "adjustedValues": self.adjustedValues,
            "weighTable": [row.as_dict() for row in self.weighTable],
            "ppm": self.ppm,
            "npkRatio": self.npkRatio,
            "stageClass": self.stageClass,
        }


# ---------------------------------------------------------------------------
# Helpers from photonflux utilities
# ---------------------------------------------------------------------------

FLOWERING_WEEK_REGEX = re.compile(r"^W(\d+)$", re.IGNORECASE)


def get_week_number(phase: str) -> Optional[int]:
    if not isinstance(phase, str):
        return None
    match = FLOWERING_WEEK_REGEX.match(phase)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def get_stage_class(phase: str) -> StageClass:
    normalized = (phase or "").strip()
    if normalized.lower() in {"early veg", "mid veg", "late veg", "frühe veg", "mitte veg", "späte veg"}:
        return "VEG"
    week_number = get_week_number(normalized)
    if week_number is None:
        if "veg" in normalized.lower() or "wachstum" in normalized.lower():
            return "VEG"
        return "VEG"
    if week_number == 1:
        return "B1"
    if week_number <= 3:
        return "P23"
    if week_number <= 7:
        return "P47"
    if week_number == 8:
        return "W8"
    return "RIPEN"


def r2(value: float) -> float:
    """Round to 2 decimal places using Decimal to avoid IEEE 754 drift on small quantities."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _add_ppm(target: Dict[str, float], profile: Dict[str, float], multiplier: float) -> None:
    if multiplier <= 0:
        return
    for key in REQUIRED_NUTRIENT_KEYS:
        if key in profile:
            target[key] = target.get(key, 0.0) + (profile[key] or 0.0) * multiplier


def _clamp_share(value: Optional[float], default: float) -> float:
    try:
        numeric = float(value) if value is not None else default
    except (TypeError, ValueError):
        numeric = default
    if not math.isfinite(numeric):
        numeric = default
    return max(0.0, min(1.0, numeric))


def _note_text(note_keys: Optional[List[str]], translations: Dict[str, Any]) -> str:
    if not note_keys:
        return ""
    parts: List[str] = []
    for key in note_keys:
        translated = translations.get(key, key)
        if isinstance(translated, str):
            trimmed = translated.strip()
            if trimmed:
                parts.append(trimmed)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Core calculation logic (ported from photonflux doserService.ts)
# ---------------------------------------------------------------------------

def calculate_dose(
    inputs: DoserInput,
    plan_config: ManagedPlan,
    *,
    translations: Optional[Dict[str, Any]] = None,
    week_tag: Optional[Callable[[str], str]] = None,
) -> Optional[CalculationResult]:
    translations = translations or DEFAULT_TRANSLATIONS
    phase_labels = translations.get("phases", {})

    base_entry = next((entry for entry in plan_config.plan if entry.phase == inputs.phase), None)
    if not base_entry:
        return None

    stage = get_stage_class(inputs.phase)
    current_week_number = get_week_number(inputs.phase)
    week_numbers = [num for num in (get_week_number(entry.phase) for entry in plan_config.plan) if num is not None]
    max_week_number = max(week_numbers) if week_numbers else None

    d_a = 0.0
    d_x = 0.0
    d_b = 0.0

    is_higher_ec = inputs.trend == "higher"
    is_lower_ec = inputs.trend == "lower"

    if inputs.claw == "yes":
        d_a -= 0.08
        if stage == "VEG":
            d_x -= 0.05

    if inputs.pale == "yes" and not is_higher_ec and stage != "RIPEN":
        d_a += 0.10

    if inputs.caMgDeficiency == "yes":
        if not is_higher_ec and inputs.claw == "no":
            d_a += 0.05
        d_x += 0.05

    if inputs.tipburn == "yes":
        factor = 1.5 if is_higher_ec else 1.0
        d_a -= 0.04 * factor
        d_x -= 0.04 * factor
        if base_entry.BZ > 0:
            d_b -= 0.03 * factor
    elif is_lower_ec and stage != "RIPEN" and inputs.claw == "no":
        if stage == "P47":
            d_x += 0.02
        if base_entry.BZ > 0 and stage in {"P23", "P47"}:
            d_b += 0.02

    if inputs.phDrift == "high":
        d_a -= 0.05
        d_x += 0.03
        if base_entry.BZ > 0:
            d_b += 0.02
        if is_higher_ec:
            d_b -= 0.02
    elif inputs.phDrift == "low":
        d_a += 0.05
        d_x -= 0.03
        if base_entry.BZ > 0:
            d_b -= 0.02

    adj_a = max(0.0, r2(base_entry.A + d_a))
    adj_x = max(0.0, r2(base_entry.X + d_x))
    adj_bz = max(0.0, r2(base_entry.BZ + d_b)) if base_entry.BZ > 0 else 0.0

    x_name = translations.get("B_name" if stage == "VEG" else "C_name", "Component")
    phase_label = phase_labels.get(inputs.phase, inputs.phase)
    tag = week_tag(inputs.phase) if week_tag else default_week_tag(inputs.phase, translations)
    base_label = f"{phase_label}{f' · {tag}' if tag else ''}"

    tide_amount = base_entry.Tide or 0.0
    helix_amount = base_entry.Helix or 0.0
    ligand_amount = base_entry.Ligand or 0.0
    silicate_amount = base_entry.Silicate if base_entry.Silicate is not None else 0.0
    silicate_unit = base_entry.SilicateUnit or "per_liter"
    note_text = _note_text(base_entry.notes, translations)

    additives_parts: List[str] = []
    if tide_amount > 0:
        additives_parts.append(f"Tide {tide_amount:.2f} g/L")
    if helix_amount > 0:
        additives_parts.append(f"Helix {helix_amount:.2f} ml/L")
    if ligand_amount > 0:
        additives_parts.append(f"Ligand {ligand_amount:.2f} ml/L")
    if silicate_amount > 0:
        label = translations.get("silicate_name", "Silicate")
        unit_suffix = translations.get("per_plant_short", "plant") if silicate_unit == "per_plant" else "L"
        additives_parts.append(f"{label} {silicate_amount:.2f} g/{unit_suffix}")
    additives_string = " • ".join(additives_parts)

    weigh_table: List[WeighRow] = []
    weigh_table.append(
        WeighRow(
            name=translations.get("A_name", "A"),
            amount=adj_a,
            unit="g",
            note=translations.get("no_A_ripen", "") if stage == "RIPEN" else "",
            tagClass="nutrient-core",
        )
    )
    weigh_table.append(
        WeighRow(
            name=x_name,
            amount=adj_x,
            unit="g",
            note="",
            tagClass="nutrient-vec" if stage == "VEG" else "nutrient-pulse",
        )
    )
    if base_entry.BZ > 0 or adj_bz > 0:
        weigh_table.append(
            WeighRow(
                name=translations.get("BURST_name", "BURST"),
                amount=adj_bz,
                unit="g",
                note=translations.get("not_in_veg", "") if stage in {"VEG", "B1", "RIPEN"} else "",
                tagClass="nutrient-burst",
            )
        )
    if tide_amount > 0:
        weigh_table.append(WeighRow(name="Tide", amount=tide_amount, unit="g", note="", tagClass=""))
    if helix_amount > 0:
        is_ripen_phase = current_week_number is not None and current_week_number >= 9
        weigh_table.append(
            WeighRow(
                name="Helix",
                amount=helix_amount,
                unit="ml",
                note="" if is_ripen_phase else translations.get("helix_pulse_note", ""),
                tagClass="",
            )
        )
    if ligand_amount > 0:
        weigh_table.append(WeighRow(name="Ligand", amount=ligand_amount, unit="ml", note="", tagClass=""))
    if silicate_amount > 0:
        weigh_table.append(
            WeighRow(
                name=translations.get("silicate_name", "Silicate"),
                amount=silicate_amount,
                unit="g",
                note=note_text or (translations.get("apply_per_plant", "Apply per plant") if silicate_unit == "per_plant" else ""),
                tagClass="",
                perPlant=silicate_unit == "per_plant",
            )
        )
    if stage == "RIPEN" and max_week_number is not None and current_week_number == max_week_number:
        weigh_table.append(
            WeighRow(
                name="Quench",
                amount=QUENCH_DOSE_G_L,
                unit="g",
                note=translations.get("ripen_only_note", ""),
                tagClass="",
            )
        )

    ppm: Dict[str, float] = {key: 0.0 for key in REQUIRED_NUTRIENT_KEYS}
    prof_x = PROF_B if stage == "VEG" else PROF_C
    _add_ppm(ppm, PROF_A, adj_a)
    _add_ppm(ppm, prof_x, adj_x)
    _add_ppm(ppm, PROF_BURST, adj_bz)
    if tide_amount > 0:
        _add_ppm(ppm, PROF_TIDE, tide_amount)
    if helix_amount > 0:
        _add_ppm(ppm, PROF_HELIX, helix_amount)
    if ligand_amount > 0:
        _add_ppm(ppm, PROF_LIGAND, ligand_amount)
    if stage == "RIPEN" and max_week_number is not None and current_week_number == max_week_number:
        _add_ppm(ppm, PROF_QUENCH, QUENCH_DOSE_G_L)

    osmosis_default = DEFAULT_OSMOSIS_SHARES.get(inputs.substrate, 0.0)
    osmosis_share = _clamp_share(plan_config.osmosis_share, osmosis_default)
    base_water_factor = 1.0 - osmosis_share
    if base_water_factor > 0:
        _add_ppm(ppm, plan_config.water_profile or {}, base_water_factor)

    n_val = ppm.get("N", 0.0)
    p_val = ppm.get("P", 0.0)
    k_val = ppm.get("K", 0.0)
    npk_ratio = "0:0:0"
    positives = [v for v in (n_val, p_val, k_val) if v > 0]
    if positives:
        divisor = min(positives)
        if divisor > 0:
            npk_ratio = f"{(n_val / divisor):.1f}:{(p_val / divisor):.1f}:{(k_val / divisor):.1f}"

    result = CalculationResult(
        baseLabel=base_label,
        baseValues={
            "A": base_entry.A,
            "X": base_entry.X,
            "BZ": base_entry.BZ,
            "Xname": x_name,
            "additives": additives_string,
        },
        deltaValues={
            "A": r2(adj_a - base_entry.A),
            "X": r2(adj_x - base_entry.X),
            "BZ": r2(adj_bz - base_entry.BZ),
            "Xname": x_name,
        },
        adjustedValues={
            "A": adj_a,
            "X": adj_x,
            "BZ": adj_bz,
            "Xname": x_name,
            "additives": additives_string,
            "ec": base_entry.EC,
        },
        weighTable=weigh_table,
        ppm=ppm,
        npkRatio=npk_ratio,
        stageClass=stage,
    )

    return result


__all__ = [
    "PlanEntry",
    "ManagedPlan",
    "DoserInput",
    "WeighRow",
    "CalculationResult",
    "calculate_dose",
    "DEFAULT_TRANSLATIONS",
    "DEFAULT_WATER_PROFILE",
    "DEFAULT_OSMOSIS_SHARES",
    "default_week_tag",
    "get_stage_class",
    "get_week_number",
]
