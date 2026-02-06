"""Operations endpoints for blueprints, rules, tasks, and predictions."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .sanitization import InputSanitizer
from .storage import get_collection_key, set_collection_key

router = APIRouter(prefix="/api/ops", tags=["operations"])

_COLLECTION = "operations"


def _get_list(key: str) -> List[Dict[str, Any]]:
    return get_collection_key(_COLLECTION, key, [])


def _save_list(key: str, items: List[Dict[str, Any]]) -> None:
    set_collection_key(_COLLECTION, key, items)


def _upsert_item(items: List[Dict[str, Any]], payload: Dict[str, Any]) -> Dict[str, Any]:
    item_id = payload.get("id") or str(uuid.uuid4())
    payload["id"] = item_id
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            items[idx] = payload
            return payload
    items.append(payload)
    return payload


def _delete_item(items: List[Dict[str, Any]], item_id: str) -> bool:
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            items.pop(idx)
            return True
    return False


class BlueprintPayload(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., max_length=120)
    description: Optional[str] = Field(default="", max_length=2000)
    tags: List[str] = Field(default_factory=list, max_length=20)
    stages: List[Dict[str, Any]] = Field(default_factory=list, max_length=50)


class RulePayload(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., max_length=120)
    enabled: bool = True
    when: str = Field(..., max_length=800)
    then: str = Field(..., max_length=800)
    priority: Optional[str] = Field(default="medium", max_length=20)
    notes: Optional[str] = Field(default="", max_length=1000)


class TaskPayload(BaseModel):
    id: Optional[str] = None
    title: str = Field(..., max_length=200)
    description: Optional[str] = Field(default="", max_length=2000)
    status: Optional[str] = Field(default="open", max_length=20)
    priority: Optional[str] = Field(default="medium", max_length=20)
    dueDate: Optional[str] = Field(default=None, max_length=40)
    growId: Optional[str] = Field(default=None, max_length=128)
    tags: List[str] = Field(default_factory=list, max_length=20)


class BatchPayload(BaseModel):
    id: Optional[str] = None
    strain: str = Field(..., max_length=120)
    room: Optional[str] = Field(default="", max_length=120)
    startDate: Optional[str] = Field(default=None, max_length=40)
    harvestDate: Optional[str] = Field(default=None, max_length=40)
    areaSqFt: Optional[float] = Field(default=None, ge=0)
    wetWeight: Optional[float] = Field(default=None, ge=0)
    dryWeight: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = Field(default="active", max_length=30)


class AlertConfigPayload(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., max_length=120)
    metric: str = Field(..., max_length=80)
    operator: str = Field(..., max_length=10)
    threshold: float
    severity: Optional[str] = Field(default="warning", max_length=20)
    enabled: bool = True


@router.get("/blueprints")
def list_blueprints() -> Dict[str, Any]:
    return {"items": _get_list("blueprints")}


@router.post("/blueprints")
def upsert_blueprint(payload: BlueprintPayload) -> Dict[str, Any]:
    items = _get_list("blueprints")
    data = payload.model_dump()
    data["tags"] = [tag.strip() for tag in (data.get("tags") or []) if tag.strip()]
    stored = _upsert_item(items, data)
    _save_list("blueprints", items)
    return {"item": stored}


@router.delete("/blueprints/{blueprint_id}")
def delete_blueprint(blueprint_id: str) -> Dict[str, Any]:
    blueprint_id = InputSanitizer.sanitize_identifier(blueprint_id)
    items = _get_list("blueprints")
    if not _delete_item(items, blueprint_id):
        raise HTTPException(status_code=404, detail="Blueprint not found")
    _save_list("blueprints", items)
    return {"status": "ok"}


@router.get("/rules")
def list_rules() -> Dict[str, Any]:
    return {"items": _get_list("rules")}


@router.post("/rules")
def upsert_rule(payload: RulePayload) -> Dict[str, Any]:
    items = _get_list("rules")
    stored = _upsert_item(items, payload.model_dump())
    _save_list("rules", items)
    return {"item": stored}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str) -> Dict[str, Any]:
    rule_id = InputSanitizer.sanitize_identifier(rule_id)
    items = _get_list("rules")
    if not _delete_item(items, rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")
    _save_list("rules", items)
    return {"status": "ok"}


@router.get("/tasks")
def list_tasks() -> Dict[str, Any]:
    return {"items": _get_list("tasks")}


@router.post("/tasks")
def upsert_task(payload: TaskPayload) -> Dict[str, Any]:
    items = _get_list("tasks")
    stored = _upsert_item(items, payload.model_dump())
    _save_list("tasks", items)
    return {"item": stored}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str) -> Dict[str, Any]:
    task_id = InputSanitizer.sanitize_identifier(task_id)
    items = _get_list("tasks")
    if not _delete_item(items, task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    _save_list("tasks", items)
    return {"status": "ok"}


@router.get("/batches")
def list_batches() -> Dict[str, Any]:
    return {"items": _get_list("batches")}


@router.post("/batches")
def upsert_batch(payload: BatchPayload) -> Dict[str, Any]:
    items = _get_list("batches")
    stored = _upsert_item(items, payload.model_dump())
    _save_list("batches", items)
    return {"item": stored}


@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: str) -> Dict[str, Any]:
    batch_id = InputSanitizer.sanitize_identifier(batch_id)
    items = _get_list("batches")
    if not _delete_item(items, batch_id):
        raise HTTPException(status_code=404, detail="Batch not found")
    _save_list("batches", items)
    return {"status": "ok"}


@router.get("/alerts")
def list_alerts() -> Dict[str, Any]:
    return {"items": _get_list("alerts")}


@router.post("/alerts")
def upsert_alert(payload: AlertConfigPayload) -> Dict[str, Any]:
    items = _get_list("alerts")
    stored = _upsert_item(items, payload.model_dump())
    _save_list("alerts", items)
    return {"item": stored}


@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: str) -> Dict[str, Any]:
    alert_id = InputSanitizer.sanitize_identifier(alert_id)
    items = _get_list("alerts")
    if not _delete_item(items, alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")
    _save_list("alerts", items)
    return {"status": "ok"}


@router.get("/predict")
def predict_insights(grow_id: str = Query("default")) -> Dict[str, Any]:
    grow_id = InputSanitizer.sanitize_identifier(grow_id)
    journal_key = f"journal_{grow_id}"
    entries: List[Dict[str, Any]] = get_collection_key("photonfluxJournal", journal_key, [])
    if not entries:
        return {
            "grow_id": grow_id,
            "risk_level": "unknown",
            "flags": [],
            "recommendations": ["Keine Journal-Daten vorhanden."],
            "yield_forecast": None,
            "data_points": 0,
        }

    entries_sorted = sorted(entries, key=lambda entry: entry.get("date", ""))
    last_entry = entries_sorted[-1]
    metrics = last_entry.get("metrics", {}) if isinstance(last_entry.get("metrics"), dict) else {}

    def _series(metric_key: str) -> List[float]:
        values: List[float] = []
        for entry in entries_sorted[-10:]:
            raw = entry.get("metrics", {}).get(metric_key)
            try:
                if raw is not None:
                    values.append(float(raw))
            except (TypeError, ValueError):
                continue
        return values

    flags: List[Dict[str, Any]] = []
    for key in ("vpd", "vwc", "ec", "ph", "temp", "humidity", "co2"):
        values = _series(key)
        if len(values) < 4:
            continue
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        deviation = (variance ** 0.5) or 1.0
        last_value = values[-1]
        zscore = abs((last_value - mean) / deviation)
        if zscore >= 2.2:
            flags.append({
                "metric": key,
                "value": last_value,
                "mean": mean,
                "zscore": round(zscore, 2),
            })

    harvest_entries = [entry for entry in entries_sorted if entry.get("harvestDetails")]
    dry_weights = []
    for entry in harvest_entries:
        harvest = entry.get("harvestDetails") or {}
        dry = harvest.get("dryWeight")
        if isinstance(dry, (int, float)):
            dry_weights.append(float(dry))
    yield_forecast = None
    if dry_weights:
        yield_forecast = {
            "last_dry_weight": dry_weights[-1],
            "avg_dry_weight": sum(dry_weights) / len(dry_weights),
            "best_dry_weight": max(dry_weights),
            "samples": len(dry_weights),
        }

    risk_level = "low"
    if len(flags) >= 3:
        risk_level = "high"
    elif len(flags) >= 1:
        risk_level = "medium"

    recommendations = []
    if not flags:
        recommendations.append("Stabile Trends. Weiter beobachten.")
    else:
        recommendations.append("Anomalien entdeckt. Target-Baender pruefen und Steuerung feinjustieren.")
    if metrics.get("vwc") is not None:
        recommendations.append("Dryback-Werte gegen Substrat-Targets abgleichen.")

    return {
        "grow_id": grow_id,
        "risk_level": risk_level,
        "flags": flags,
        "recommendations": recommendations,
        "yield_forecast": yield_forecast,
        "data_points": len(entries_sorted),
        "last_observation": {
            "date": last_entry.get("date"),
            "metrics": metrics,
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
