"""Nutrient calculator and inventory endpoints."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from nutrient_engine import NutrientCalculator
from .plan_routes import SubstrateLiteral

router = APIRouter(prefix="/api/nutrients", tags=["nutrients"])

_ENGINE_CACHE: Dict[str, NutrientCalculator] = {}


def _get_engine(substrate: Optional[str]) -> NutrientCalculator:
    cache_key = substrate or "__default__"
    engine = _ENGINE_CACHE.get(cache_key)
    if engine is None:
        engine = NutrientCalculator(substrate=substrate)
        _ENGINE_CACHE[cache_key] = engine
    return engine


class MixRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    week_key: str = Field(..., alias="current_week")
    liters: float = Field(..., alias="reservoir_liters", gt=0)
    substrate: Optional[SubstrateLiteral] = None


class InventoryConsumePayload(BaseModel):
    consumption: Dict[str, float]
    substrate: Optional[SubstrateLiteral] = None


@router.get("/plan")
def read_plan(
    current_week: str = Query(...),
    reservoir_liters: float = Query(..., gt=0),
    substrate: Optional[SubstrateLiteral] = None,
) -> Dict[str, Any]:
    engine = _get_engine(substrate)
    try:
        result = engine.preview_plan(current_week, reservoir_liters)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.post("/plan")
def preview_plan(payload: MixRequest) -> Dict[str, Any]:
    engine = _get_engine(payload.substrate)
    try:
        result = engine.preview_plan(payload.week_key, payload.liters)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.post("/confirm")
def confirm_mix(payload: MixRequest) -> Dict[str, Any]:
    engine = _get_engine(payload.substrate)
    try:
        result = engine.mix_tank(payload.week_key, payload.liters)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "mix": result["mix"],
        "top_dress": result["top_dress"],
        "inventory": result["inventory"],
        "alerts": result["alerts"],
        "refill_needed": result["alerts"],
    }


@router.post("/calculate")
def calculate_mix(payload: MixRequest) -> Dict[str, Any]:
    """Backward-compatible alias for /plan."""
    return preview_plan(payload)


@router.post("/mix")
def confirm_mix_legacy(payload: MixRequest) -> Dict[str, Any]:
    """Backward-compatible alias for /confirm."""
    return confirm_mix(payload)


@router.get("/inventory")
def read_inventory() -> Dict[str, Any]:
    engine = _get_engine(None)
    return {
        "inventory": engine.get_stock_status(),
        "alerts": engine.check_refill_needed(),
        "refill_needed": engine.check_refill_needed(),
    }


@router.post("/inventory/consume")
def consume_inventory(payload: InventoryConsumePayload) -> Dict[str, Any]:
    engine = _get_engine(payload.substrate)
    engine.consume_mix(payload.consumption)
    return {
        "inventory": engine.get_stock_status(),
        "alerts": engine.check_refill_needed(),
        "refill_needed": engine.check_refill_needed(),
    }
