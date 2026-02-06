"""Single-ingredient nutrient calculator with inventory persistence."""
from __future__ import annotations

import json
import logging
import os
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, List

import portalocker

from app.plan_routes import BASE_PLAN_TEMPLATES

logger = logging.getLogger(__name__)

DEFAULT_SUBSTRATE = os.getenv("NUTRIENT_PLAN_SUBSTRATE", "coco")
WEEK_REGEX = re.compile(r"^W(\d+)$", re.IGNORECASE)
VEG_PHASES = {"Early Veg", "Mid Veg", "Late Veg"}
LOCK_TIMEOUT = 10.0
ALERT_TEMPLATE = "Achtung, {name} reicht nur noch für ca. 1 Woche. Jetzt nachbestellen."
SHIELD_KEY = "shield"
SHIELD_DOSE_PER_PLANT = 4.0
SHIELD_PHASES = {"W1"}
SHIELD_INSTRUCTION = "Nicht in den Tank mischen! Um den Stamm streuen."
SHOP_URL = os.getenv("SHOP_URL", "https://growmind.ai/shop")


def _round2(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class NutrientCalculator:
    """Calculate single-ingredient mixes and persist inventory state."""

    def __init__(self, *, substrate: str | None = None, state_path: Path | None = None) -> None:
        self.substrate = substrate or DEFAULT_SUBSTRATE
        self._plan_entries = self._load_plan_entries(self.substrate)
        self._inventory_config = self._load_inventory_config()
        self._state_path = state_path or self._default_state_path()
        self._ensure_state_file()

    def preview_mix(self, week_key: str, liters: float) -> Dict[str, float]:
        return self._calculate_mix(week_key, liters)

    def calculate_mix(self, current_week: str, reservoir_liters: float) -> Dict[str, float]:
        """Backward-compatible alias for previewing mixes."""
        return self._calculate_mix(current_week, reservoir_liters)

    def calc_liquid_mix(self, liters: float, week_key: str | None = None) -> Dict[str, float]:
        phase_key = week_key or "Early Veg"
        phase = self._normalize_phase(phase_key)
        return self._calculate_liquid_mix(phase, liters)

    def calc_solid_application(self, plant_count: int) -> Dict[str, float]:
        count = self._sanitize_plant_count(plant_count)
        return {SHIELD_KEY: _round2(SHIELD_DOSE_PER_PLANT * count)}

    def mix_tank(self, week_key: str, liters: float) -> Dict[str, Any]:
        mix = self._calculate_mix(week_key, liters)
        tank_mix, top_dress = self._split_top_dress(mix)
        updated = self._consume_mix(mix)
        return {
            "mix": tank_mix,
            "top_dress": top_dress,
            "inventory": self._format_stock(updated),
            "alerts": self._build_alerts(updated),
        }

    def preview_plan(self, week_key: str, liters: float) -> Dict[str, Any]:
        mix = self._calculate_mix(week_key, liters)
        tank_mix, top_dress = self._split_top_dress(mix)
        return {"mix": tank_mix, "top_dress": top_dress}

    def get_stock_status(self) -> Dict[str, Dict[str, Any]]:
        state = self._load_state()
        return self._format_stock(state)

    def consume_mix(self, mix_data: Dict[str, float]) -> Dict[str, float]:
        """Backward-compatible helper to subtract consumption."""
        return self._consume_mix(mix_data)

    def consume_inventory(self, usage_dict: Dict[str, float]) -> Dict[str, float]:
        return self._consume_mix(usage_dict)

    def check_refill_needed(self) -> List[Dict[str, Any]]:
        return self.check_inventory_status()

    def check_inventory_status(self) -> List[Dict[str, Any]]:
        """Return shopping-list alerts for items below threshold_warn."""
        return self.get_shopping_list()

    def get_shopping_list(self) -> List[Dict[str, Any]]:
        state = self._load_state()
        return self._build_alerts(state)

    def _resolve_stage(self, phase: str) -> str:
        if phase in VEG_PHASES:
            return "veg"
        match = WEEK_REGEX.match(phase)
        if match:
            week = int(match.group(1))
            if week >= 10:
                return "ripen"
            return "flower"
        return "veg"

    def _normalize_phase(self, phase: str) -> str:
        raw = str(phase or "").strip()
        if not raw:
            raise ValueError("current_week is required")
        match = WEEK_REGEX.match(raw)
        if match:
            return f"W{int(match.group(1))}"
        lowered = raw.lower()
        if "veg" in lowered:
            if "early" in lowered:
                return "Early Veg"
            if "mid" in lowered or "middle" in lowered:
                return "Mid Veg"
            if "late" in lowered:
                return "Late Veg"
        return raw

    def _load_plan_entries(self, substrate: str) -> Dict[str, Dict[str, Any]]:
        template = BASE_PLAN_TEMPLATES.get(substrate)
        if not template:
            raise ValueError(f"Unknown substrate '{substrate}'")
        entries: Dict[str, Dict[str, Any]] = {}
        for entry in template.get("plan", []):
            phase = entry.get("phase")
            if phase:
                entries[str(phase)] = entry
        if not entries:
            raise ValueError("No plan entries available")
        return entries

    def _load_inventory_config(self) -> Dict[str, Dict[str, Any]]:
        mapping_path = self._project_root() / "mapping.json"
        if not mapping_path.exists():
            raise FileNotFoundError("mapping.json not found at project root")
        with mapping_path.open("r", encoding="utf-8") as handle:
            mapping = json.load(handle)
        inventory = mapping.get("inventory") or {}
        items: Dict[str, Dict[str, Any]] = {}
        for group in ("nutrients", "additives"):
            for key, meta in (inventory.get(group) or {}).items():
                if isinstance(meta, dict):
                    items[key] = {**meta, "group": group}
        if not items:
            raise ValueError("Inventory config missing in mapping.json")
        return items

    def _default_state_path(self) -> Path:
        return self._project_root() / "data" / "inventory.json"

    def _project_root(self) -> Path:
        return Path(__file__).resolve().parents[1]

    def _ensure_state_file(self) -> None:
        state = self._load_state()
        self._save_state(state)

    def _calculate_mix(self, week_key: str, liters: float) -> Dict[str, float]:
        phase = self._normalize_phase(week_key)
        liquid_mix = self._calculate_liquid_mix(phase, liters)
        shield_amount = 0.0
        if phase in SHIELD_PHASES:
            plants_count = self._sanitize_plant_count(self._load_app_settings().get("plants_count", 1))
            shield_amount = self.calc_solid_application(plants_count)[SHIELD_KEY]
        return {**liquid_mix, SHIELD_KEY: shield_amount}

    def _calculate_liquid_mix(self, phase: str, liters: float) -> Dict[str, float]:
        if liters <= 0:
            raise ValueError("liters must be greater than 0")
        entry = self._plan_entries.get(phase)
        if not entry:
            raise ValueError(f"Unknown phase '{phase}'")

        stage = self._resolve_stage(phase)
        liters = float(liters)

        a_per_l = float(entry.get("A") or 0.0)
        x_per_l = float(entry.get("X") or 0.0)
        bz_per_l = float(entry.get("BZ") or 0.0)
        tide_per_l = float(entry.get("Tide") or 0.0)
        helix_per_l = float(entry.get("Helix") or 0.0)
        ligand_per_l = float(entry.get("Ligand") or 0.0)

        if stage == "veg":
            part_a_per_l = a_per_l
            part_b_per_l = x_per_l
            part_c_per_l = 0.0
            burst_per_l = 0.0
        elif stage == "ripen":
            part_a_per_l = 0.0
            part_b_per_l = 0.0
            part_c_per_l = x_per_l
            burst_per_l = bz_per_l
        else:
            part_a_per_l = a_per_l
            part_b_per_l = 0.0
            part_c_per_l = x_per_l
            burst_per_l = bz_per_l

        return {
            "part_a": _round2(part_a_per_l * liters),
            "part_b": _round2(part_b_per_l * liters),
            "part_c": _round2(part_c_per_l * liters),
            "burst": _round2(burst_per_l * liters),
            "kelp": _round2(tide_per_l * liters),
            "amino": _round2(helix_per_l * liters),
            "fulvic": _round2(ligand_per_l * liters),
        }

    def _consume_mix(self, mix_data: Dict[str, float]) -> Dict[str, float]:
        state = self._load_state()
        updated = dict(state)
        for key in self._inventory_config:
            used = float(mix_data.get(key, 0.0) or 0.0)
            if used < 0:
                used = 0.0
            updated[key] = max(0.0, float(updated.get(key, 0.0)) - used)
        self._save_state(updated)
        return updated

    def _split_top_dress(self, mix: Dict[str, float]) -> tuple[Dict[str, float], List[Dict[str, Any]]]:
        tank_mix = dict(mix)
        shield_amount = float(tank_mix.pop(SHIELD_KEY, 0.0) or 0.0)
        top_dress: List[Dict[str, Any]] = []
        if shield_amount > 0:
            shield_meta = self._inventory_config.get(SHIELD_KEY, {})
            top_dress.append(
                {
                    "key": SHIELD_KEY,
                    "name": shield_meta.get("name", SHIELD_KEY),
                    "amount": _round2(shield_amount),
                    "unit": shield_meta.get("unit", "g"),
                    "instruction": SHIELD_INSTRUCTION,
                }
            )
        return tank_mix, top_dress

    def _format_stock(self, state: Dict[str, float]) -> Dict[str, Dict[str, Any]]:
        status: Dict[str, Dict[str, Any]] = {}
        for key, meta in self._inventory_config.items():
            full_size = float(meta.get("full_size") or 0.0)
            current = float(state.get(key, 0.0))
            percent = (current / full_size * 100.0) if full_size > 0 else 0.0
            status[key] = {
                "name": meta.get("name"),
                "unit": meta.get("unit"),
                "full_size": full_size,
                "threshold_warn": float(meta.get("threshold_warn") or 0.0),
                "description": meta.get("description"),
                "group": meta.get("group"),
                "current": _round2(current),
                "percent": _round2(percent),
            }
        return status

    def _build_alerts(self, state: Dict[str, float]) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []
        for key, meta in self._inventory_config.items():
            threshold = float(meta.get("threshold_warn") or 0.0)
            current = float(state.get(key, 0.0))
            if threshold > 0 and current < threshold:
                name = meta.get("name") or key
                alerts.append(
                    {
                        "key": key,
                        "name": name,
                        "unit": meta.get("unit"),
                        "current": _round2(current),
                        "threshold_warn": threshold,
                        "message": ALERT_TEMPLATE.format(name=name),
                        "reorder_url": self._reorder_url(key),
                    }
                )
        return alerts

    def _shield_amount(self, phase: str) -> float:
        if phase not in SHIELD_PHASES:
            return 0.0
        app_settings = self._load_app_settings()
        count = self._sanitize_plant_count(app_settings.get("plants_count", 1))
        return self.calc_solid_application(count)[SHIELD_KEY]

    def _sanitize_plant_count(self, value: Any) -> int:
        try:
            count = int(value)
        except (TypeError, ValueError):
            count = 1
        return max(0, count)

    def _load_app_settings(self) -> Dict[str, Any]:
        settings: Dict[str, Any] = {}
        path = self._project_root() / "data" / "app_settings.json"
        if path.exists():
            try:
                with path.open("r", encoding="utf-8") as handle:
                    raw = json.load(handle)
                if isinstance(raw, dict):
                    settings.update(raw)
            except (OSError, json.JSONDecodeError):
                logger.warning("Invalid app settings file at %s", path)
        env_count = os.getenv("PLANTS_COUNT")
        if env_count is not None:
            settings["plants_count"] = env_count
        if "plants_count" not in settings:
            settings["plants_count"] = 1
        return settings

    def _reorder_url(self, key: str) -> str:
        base = SHOP_URL.rstrip("/")
        return f"{base}/{key}"

    def _lock_path(self, path: Path) -> Path:
        return path.with_suffix(path.suffix + ".lock")

    def _acquire_lock(self, path: Path):
        return portalocker.Lock(str(self._lock_path(path)), timeout=LOCK_TIMEOUT)

    def _load_state(self) -> Dict[str, float]:
        path = self._state_path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._acquire_lock(path):
            try:
                with path.open("r", encoding="utf-8") as handle:
                    data = json.load(handle)
            except FileNotFoundError:
                data = {}
            except json.JSONDecodeError:
                logger.warning("Invalid JSON in %s. Resetting inventory state.", path)
                data = {}
        return self._normalize_state(data)

    def _save_state(self, state: Dict[str, float]) -> None:
        path = self._state_path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._acquire_lock(path):
            temp_path = path.with_name(path.name + ".tmp")
            with temp_path.open("w", encoding="utf-8") as handle:
                json.dump(state, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            temp_path.replace(path)

    def _normalize_state(self, data: Dict[str, Any]) -> Dict[str, float]:
        normalized: Dict[str, float] = {}
        for key, meta in self._inventory_config.items():
            full_size = float(meta.get("full_size") or 0.0)
            try:
                current = float(data.get(key, full_size))
            except (TypeError, ValueError):
                current = full_size
            if current < 0:
                current = 0.0
            if full_size > 0 and current > full_size:
                current = full_size
            normalized[key] = current
        return normalized


NutrientEngine = NutrientCalculator
