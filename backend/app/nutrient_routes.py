"""Nutrient calculator and inventory endpoints."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from nutrient_engine import NutrientCalculator
from .plan_routes import CultivarLiteral, SubstrateLiteral, get_active_plan_for, get_active_plan_id_for, get_plan_by_id_for

router = APIRouter(prefix="/api/nutrients", tags=["nutrients"])

_ENGINE_CACHE: Dict[str, NutrientCalculator] = {}


def _get_engine(
    substrate: Optional[str],
    *,
    plan_entries: Optional[Dict[str, Any]] = None,
    plan_adjustments: Optional[Dict[str, Dict[str, float]]] = None,
    cache_key: Optional[str] = None,
) -> NutrientCalculator:
    cache_key = cache_key or substrate or "__default__"
    engine = _ENGINE_CACHE.get(cache_key)
    if engine is None:
        entries = None
        if plan_entries and isinstance(plan_entries.get("plan"), list):
            entries = plan_entries.get("plan")
        engine = NutrientCalculator(substrate=substrate, plan_entries=entries, plan_adjustments=plan_adjustments)
        _ENGINE_CACHE[cache_key] = engine
    return engine


class MixRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    week_key: str = Field(..., alias="current_week")
    liters: float = Field(..., alias="reservoir_liters", gt=0)
    cultivar: Optional[CultivarLiteral] = None
    substrate: Optional[SubstrateLiteral] = None
    plan_id: Optional[str] = None
    observations: Optional[Dict[str, str]] = None


class InventoryConsumePayload(BaseModel):
    consumption: Dict[str, float]
    substrate: Optional[SubstrateLiteral] = None


class InventorySetPayload(BaseModel):
    component: str
    grams: float


@router.get("/plan")
def read_plan(
    current_week: str = Query(...),
    reservoir_liters: float = Query(..., gt=0),
    cultivar: Optional[CultivarLiteral] = None,
    substrate: Optional[SubstrateLiteral] = None,
    plan_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    plan_payload = None
    cache_key = substrate or "__default__"
    if cultivar and substrate:
        if plan_id:
            plan_payload = get_plan_by_id_for(cultivar, substrate, plan_id)
        else:
            plan_payload = get_active_plan_for(cultivar, substrate)
            plan_id = get_active_plan_id_for(cultivar, substrate)
        cache_key = f"{cultivar}:{substrate}:{plan_id or 'default'}"
    plan_adjustments = plan_payload.get("observationAdjustments") if isinstance(plan_payload, dict) else None
    engine = _get_engine(substrate, plan_entries=plan_payload, plan_adjustments=plan_adjustments, cache_key=cache_key)
    try:
        result = engine.preview_plan(current_week, reservoir_liters)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(exc)}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown phase/stage: {str(exc)}") from exc
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=500, detail=f"Nutrient plan error: {str(exc)}") from exc


@router.post("/plan")
def preview_plan(payload: MixRequest) -> Dict[str, Any]:
    plan_payload = None
    cache_key = payload.substrate or "__default__"
    if payload.cultivar and payload.substrate:
        if payload.plan_id:
            plan_payload = get_plan_by_id_for(payload.cultivar, payload.substrate, payload.plan_id)
            cache_key = f"{payload.cultivar}:{payload.substrate}:{payload.plan_id}"
        else:
            plan_payload = get_active_plan_for(payload.cultivar, payload.substrate)
            plan_id = get_active_plan_id_for(payload.cultivar, payload.substrate)
            cache_key = f"{payload.cultivar}:{payload.substrate}:{plan_id}"
    plan_adjustments = plan_payload.get("observationAdjustments") if isinstance(plan_payload, dict) else None
    engine = _get_engine(payload.substrate, plan_entries=plan_payload, plan_adjustments=plan_adjustments, cache_key=cache_key)
    try:
        result = engine.preview_plan(payload.week_key, payload.liters, payload.observations)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(exc)}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown phase/stage: {str(exc)}") from exc
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=500, detail=f"Nutrient plan error: {str(exc)}") from exc


@router.post("/confirm")
def confirm_mix(payload: MixRequest) -> Dict[str, Any]:
    plan_payload = None
    cache_key = payload.substrate or "__default__"
    if payload.cultivar and payload.substrate:
        if payload.plan_id:
            plan_payload = get_plan_by_id_for(payload.cultivar, payload.substrate, payload.plan_id)
            cache_key = f"{payload.cultivar}:{payload.substrate}:{payload.plan_id}"
        else:
            plan_payload = get_active_plan_for(payload.cultivar, payload.substrate)
            plan_id = get_active_plan_id_for(payload.cultivar, payload.substrate)
            cache_key = f"{payload.cultivar}:{payload.substrate}:{plan_id}"
    plan_adjustments = plan_payload.get("observationAdjustments") if isinstance(plan_payload, dict) else None
    engine = _get_engine(payload.substrate, plan_entries=plan_payload, plan_adjustments=plan_adjustments, cache_key=cache_key)
    try:
        result = engine.mix_tank(payload.week_key, payload.liters, payload.observations)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(exc)}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown phase/stage: {str(exc)}") from exc
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=500, detail=f"Mix tank error: {str(exc)}") from exc


@router.get("/inventory")
def read_inventory() -> Dict[str, Any]:
    try:
        engine = _get_engine(None)
        status = engine.get_stock_status()
        alerts = engine.check_refill_needed()
        return {
            "inventory": status,
            "alerts": alerts,
            "refill_needed": alerts,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inventory error: {str(exc)}") from exc


@router.post("/inventory/consume")
def consume_inventory(payload: InventoryConsumePayload) -> Dict[str, Any]:
    engine = _get_engine(payload.substrate)
    try:
        engine.consume_mix(payload.consumption)
        status = engine.get_stock_status()
        alerts = engine.check_refill_needed()
        return {
            "inventory": status,
            "alerts": alerts,
            "refill_needed": alerts,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid consumption data: {str(exc)}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Consume error: {str(exc)}") from exc


@router.post("/inventory/set")
def set_inventory(payload: InventorySetPayload) -> Dict[str, Any]:
    engine = _get_engine(None)
    try:
        if payload.grams < 0:
            raise ValueError("Inventory value must be non-negative")
        engine.set_inventory_level(payload.component, payload.grams)
        status = engine.get_stock_status()
        alerts = engine.check_refill_needed()
        return {
            "inventory": status,
            "alerts": alerts,
            "refill_needed": alerts,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid inventory data: {str(exc)}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inventory update error: {str(exc)}") from exc
