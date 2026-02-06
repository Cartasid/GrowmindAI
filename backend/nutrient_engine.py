"""Advanced nutrient calculator with PPM profiles and SQLite persistence."""
from __future__ import annotations

import json
import logging
import math
import os
import re
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional

from app.database import db
from app.plan_routes import BASE_PLAN_TEMPLATES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants and Conversion Factors
# ---------------------------------------------------------------------------

P_FROM_P2O5 = 0.4365
K_FROM_K2O = 0.8301
S_FROM_SO3 = 0.4
MKP_P2O5 = 0.52
MKP_K2O = 0.34
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

# Profiles (PPM per 1g/L)
PROF_A = {
    "N": (0.600 * CACALGG_N + 0.400 * MGNITRATE_N) * 1000.0,
    "Ca": (0.600 * CACALGG_CA) * 1000.0,
    "Mg": (0.400 * MGNITRATE_MG) * 1000.0,
}

# Simplified salt profiles for B and C
PROF_B = {
    "N": 115.0, "P": 52.0, "K": 205.0, "Mg": 58.0, "S": 82.0,
    "Fe": 1.1, "Mn": 0.4, "Zn": 0.2, "B": 0.2, "Cu": 0.05, "Mo": 0.04
}
PROF_C = {
    "N": 0.0, "P": 75.0, "K": 245.0, "Mg": 62.0, "S": 95.0,
    "Fe": 1.2, "Mn": 0.5, "Zn": 0.25, "B": 0.25, "Cu": 0.06, "Mo": 0.05
}

PROF_BURST = {
    "P": 0.60 * MKP_P2O5 * P_FROM_P2O5 * 1000.0,
    "K": (0.60 * MKP_K2O + 0.39 * SOP_K2O) * K_FROM_K2O * 1000.0,
    "S": (0.39 * SOP_SO3 * S_FROM_SO3 + 0.025 * EPSOM_S) * 1000.0,
    "Mg": 0.025 * EPSOM_MG * 1000.0
}

REQUIRED_NUTRIENT_KEYS = ["N", "P", "K", "Ca", "Mg", "S", "Na", "Fe", "B", "Mo", "Mn", "Zn", "Cu", "Cl"]

# ---------------------------------------------------------------------------
# Logic and Helpers
# ---------------------------------------------------------------------------

def _round2(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def _add_ppm(target: Dict[str, float], profile: Dict[str, float], multiplier: float) -> None:
    if multiplier <= 0:
        return
    for key in REQUIRED_NUTRIENT_KEYS:
        if key in profile:
            target[key] = target.get(key, 0.0) + (profile[key] or 0.0) * multiplier

# ---------------------------------------------------------------------------
# NutrientCalculator Class
# ---------------------------------------------------------------------------

class NutrientCalculator:
    def __init__(self, *, substrate: str | None = None) -> None:
        self.substrate = substrate or os.getenv("NUTRIENT_PLAN_SUBSTRATE", "coco")
        self._plan_entries = self._load_plan_entries(self.substrate)
        self._inventory_config = self._load_inventory_config()
        self._seed_inventory()

    def _load_plan_entries(self, substrate: str) -> Dict[str, Dict[str, Any]]:
        template = BASE_PLAN_TEMPLATES.get(substrate)
        if not template:
            raise ValueError(f"Unknown substrate '{substrate}'")
        entries = {str(e["phase"]): e for e in template.get("plan", []) if "phase" in e}
        if not entries:
            raise ValueError("No plan entries available")
        return entries

    def _load_inventory_config(self) -> Dict[str, Dict[str, Any]]:
        mapping_path = Path(__file__).resolve().parent / "mapping.json"
        if not mapping_path.exists():
             mapping_path = Path(__file__).resolve().parents[1] / "mapping.json"

        with mapping_path.open("r", encoding="utf-8") as handle:
            mapping = json.load(handle)

        inventory = mapping.get("inventory") or {}
        items = {}
        for group in ("nutrients", "additives"):
            for key, meta in (inventory.get(group) or {}).items():
                if isinstance(meta, dict):
                    items[key] = {**meta, "group": group}
        return items

    def _seed_inventory(self):
        """Seed inventory table from mapping.json defaults if not already present."""
        seed_data = {}
        for key, meta in self._inventory_config.items():
            # Check for environment variable overrides (e.g. INVENTORY_START_part_a)
            env_key = f"INVENTORY_START_{key}"
            val = os.getenv(env_key)
            if val is not None:
                try:
                    seed_data[key] = float(val)
                except ValueError:
                    seed_data[key] = float(meta.get("full_size") or 0.0)
            else:
                seed_data[key] = float(meta.get("full_size") or 0.0)

        db.ensure_inventory_items(seed_data)

    def _normalize_phase(self, phase: str) -> str:
        raw = str(phase or "").strip()
        match = re.match(r"^W(\d+)$", raw, re.IGNORECASE)
        if match:
            return f"W{int(match.group(1))}"
        lowered = raw.lower()
        if "early" in lowered and "veg" in lowered: return "Early Veg"
        if "mid" in lowered and "veg" in lowered: return "Mid Veg"
        if "late" in lowered and "veg" in lowered: return "Late Veg"
        return raw

    def _resolve_stage(self, phase: str) -> str:
        if "Veg" in phase: return "veg"
        match = re.match(r"^W(\d+)$", phase, re.IGNORECASE)
        if match:
            week = int(match.group(1))
            return "ripen" if week >= 10 else "flower"
        return "veg"

    def preview_plan(self, week_key: str, liters: float) -> Dict[str, Any]:
        phase = self._normalize_phase(week_key)
        mix = self._calculate_mix_raw(phase, liters)

        tank_mix = {k: v for k, v in mix.items() if k != "shield"}
        top_dress = []
        if mix.get("shield", 0) > 0:
            top_dress.append({
                "key": "shield",
                "name": self._inventory_config.get("shield", {}).get("name", "Shield"),
                "amount": mix["shield"],
                "unit": "g",
                "instruction": "Um den Stamm streuen (nicht in den Tank)."
            })

        return {
            "mix": tank_mix,
            "top_dress": top_dress,
            "ppm": self._calculate_ppm(phase, 1.0) # Base PPM per L
        }

    def _calculate_mix_raw(self, phase: str, liters: float) -> Dict[str, float]:
        entry = self._plan_entries.get(phase)
        if not entry:
            raise ValueError(f"Unknown phase '{phase}'")

        stage = self._resolve_stage(phase)
        a_per_l = float(entry.get("A") or 0.0)
        x_per_l = float(entry.get("X") or 0.0)
        bz_per_l = float(entry.get("BZ") or 0.0)

        mix = {
            "part_a": _round2(a_per_l * liters) if stage != "ripen" else 0.0,
            "part_b": _round2(x_per_l * liters) if stage == "veg" else 0.0,
            "part_c": _round2(x_per_l * liters) if stage != "veg" else 0.0,
            "burst": _round2(bz_per_l * liters),
            "kelp": _round2(float(entry.get("Tide") or 0.0) * liters),
            "amino": _round2(float(entry.get("Helix") or 0.0) * liters),
            "fulvic": _round2(float(entry.get("Ligand") or 0.0) * liters),
        }

        if phase == "W1" or phase == "Mid Veg":
             mix["shield"] = 4.0 # Standard dose

        return mix

    def _calculate_ppm(self, phase: str, dose_factor: float) -> Dict[str, float]:
        entry = self._plan_entries.get(phase)
        if not entry: return {}

        stage = self._resolve_stage(phase)
        ppm = {k: 0.0 for k in REQUIRED_NUTRIENT_KEYS}

        _add_ppm(ppm, PROF_A, float(entry.get("A") or 0.0) * dose_factor)
        if stage == "veg":
            _add_ppm(ppm, PROF_B, float(entry.get("X") or 0.0) * dose_factor)
        else:
            _add_ppm(ppm, PROF_C, float(entry.get("X") or 0.0) * dose_factor)

        _add_ppm(ppm, PROF_BURST, float(entry.get("BZ") or 0.0) * dose_factor)
        return {k: round(v, 2) for k, v in ppm.items()}

    def mix_tank(self, week_key: str, liters: float) -> Dict[str, Any]:
        result = self.preview_plan(week_key, liters)
        self.consume_mix(result["mix"])
        if result["top_dress"]:
            self.consume_mix({"shield": result["top_dress"][0]["amount"]})

        inventory = self.get_stock_status()
        alerts = self.check_refill_needed()
        return {**result, "inventory": inventory, "alerts": alerts}

    def consume_mix(self, mix: Dict[str, float]):
        current = db.fetch_inventory()
        for key, used in mix.items():
            if key in current:
                new_level = max(0.0, current[key]["grams"] - used)
                db.update_inventory(key, new_level)
            else:
                # Key didn't exist in current, but seeding should prevent this.
                # If it happens, we treat full_size as 0 or default and just set it to 0 if consumed.
                db.update_inventory(key, 0.0, 0.0)

    def get_stock_status(self) -> Dict[str, Dict[str, Any]]:
        levels = db.fetch_inventory()
        status = {}
        for key, meta in self._inventory_config.items():
            current = levels.get(key, {}).get("grams", 0.0)
            full = float(meta.get("full_size") or 1.0)
            status[key] = {
                **meta,
                "current": _round2(current),
                "percent": _round2((current / full) * 100.0)
            }
        return status

    def check_refill_needed(self) -> List[Dict[str, Any]]:
        status = self.get_stock_status()
        alerts = []
        for key, info in status.items():
            if info["current"] < info.get("threshold_warn", 0):
                alerts.append({
                    "key": key,
                    "name": info["name"],
                    "message": f"Bestand von {info['name']} ist niedrig.",
                    "current": info["current"],
                    "unit": info["unit"]
                })
        return alerts

NutrientEngine = NutrientCalculator
