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
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(exc)}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown phase/stage: {str(exc)}") from exc
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=500, detail=f"Nutrient plan error: {str(exc)}") from exc


@router.post("/plan")
def preview_plan(payload: MixRequest) -> Dict[str, Any]:
    engine = _get_engine(payload.substrate)
    try:
        result = engine.preview_plan(payload.week_key, payload.liters)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(exc)}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown phase/stage: {str(exc)}") from exc
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=500, detail=f"Nutrient plan error: {str(exc)}") from exc


@router.post("/confirm")
def confirm_mix(payload: MixRequest) -> Dict[str, Any]:
    engine = _get_engine(payload.substrate)
    try:
        result = engine.mix_tank(payload.week_key, payload.liters)
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
