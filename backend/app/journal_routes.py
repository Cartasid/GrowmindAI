"""Journal endpoints mirroring PhotonFlux functionality."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .storage import get_collection, set_collection

router = APIRouter(prefix="/api/journal", tags=["journal"])

JOURNAL_COLLECTION = "photonfluxJournal"


class JournalMetrics(BaseModel):
    plantHeight: Optional[float] = None
    temp: Optional[float] = None
    humidity: Optional[float] = None
    ec: Optional[float] = None
    ph: Optional[float] = None
    ppfd: Optional[float] = None
    co2: Optional[float] = None
    rootTemp: Optional[float] = None
    leafTemp: Optional[float] = None
    vpd: Optional[float] = None
    vwc: Optional[float] = None
    soilEc: Optional[float] = None


class FeedingDetails(BaseModel):
    A: float
    X: float
    BZ: float
    EC: str
    pH: str


class Adjustments(BaseModel):
    trend: Optional[str] = None
    tipburn: Optional[str] = None
    pale: Optional[str] = None
    caMgDeficiency: Optional[str] = None
    claw: Optional[str] = None
    phDrift: Optional[str] = None


class HarvestDetails(BaseModel):
    wetWeight: Optional[float] = None
    dryWeight: Optional[float] = None
    trimWeight: Optional[float] = None
    qualityRating: Optional[float] = Field(default=None, ge=1, le=5)
    densityRating: Optional[float] = Field(default=None, ge=1, le=5)
    terpenProfile: Optional[str] = None
    resinProduction: Optional[str] = None
    dryingNotes: Optional[str] = None


class JournalEntryPayload(BaseModel):
    id: Optional[str] = None
    growId: Optional[str] = None
    date: str
    phase: str
    entryType: str
    priority: str
    notes: str = ""
    images: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    metrics: JournalMetrics = Field(default_factory=JournalMetrics)
    feedingDetails: Optional[FeedingDetails] = None
    adjustments: Optional[Adjustments] = None
    aiAnalysisResult: Optional[Dict[str, Any]] = None
    harvestDetails: Optional[HarvestDetails] = None
    relatedEntryId: Optional[str] = None


class JournalBulkPayload(BaseModel):
    entries: List[JournalEntryPayload]


class JournalEntryResponse(BaseModel):
    entry: JournalEntryPayload


def _journal_key(grow_id: str) -> str:
    return f"journal_{grow_id}"


def _load_entries(grow_id: str) -> List[Dict[str, Any]]:
    store = get_collection(JOURNAL_COLLECTION)
    return store.get(_journal_key(grow_id), [])


def _save_entries(grow_id: str, entries: List[Dict[str, Any]]) -> None:
    store = get_collection(JOURNAL_COLLECTION)
    store[_journal_key(grow_id)] = entries
    set_collection(JOURNAL_COLLECTION, store)


def _normalize_entry(payload: JournalEntryPayload) -> Dict[str, Any]:
    data = payload.model_dump()
    data["id"] = payload.id or str(uuid.uuid4())
    data["images"] = payload.images or []
    data["tags"] = payload.tags or []
    data["metrics"] = payload.metrics.model_dump()
    if payload.feedingDetails:
        data["feedingDetails"] = payload.feedingDetails.model_dump()
    if payload.adjustments:
        data["adjustments"] = payload.adjustments.model_dump()
    if payload.harvestDetails:
        data["harvestDetails"] = payload.harvestDetails.model_dump()
    return data


@router.get("/{grow_id}")
def read_journal(grow_id: str):
    entries = _load_entries(grow_id)
    sorted_entries = sorted(entries, key=lambda entry: entry.get("date", ""), reverse=True)
    return {"entries": sorted_entries}


@router.post("/{grow_id}")
def save_journal(grow_id: str, payload: JournalBulkPayload):
    normalized = [_normalize_entry(entry) for entry in payload.entries]
    _save_entries(grow_id, normalized)
    return {"count": len(normalized)}


@router.post("/{grow_id}/entry")
def add_entry(grow_id: str, payload: JournalEntryPayload):
    entries = _load_entries(grow_id)
    normalized = _normalize_entry(payload)
    entries.insert(0, normalized)
    _save_entries(grow_id, entries)
    return JournalEntryResponse(entry=JournalEntryPayload(**normalized))


@router.delete("/{grow_id}/entry/{entry_id}")
def delete_entry(grow_id: str, entry_id: str):
    entries = _load_entries(grow_id)
    filtered = [entry for entry in entries if entry.get("id") != entry_id]
    if len(filtered) == len(entries):
        raise HTTPException(status_code=404, detail="Entry not found")
    _save_entries(grow_id, filtered)
    return {"deleted": True}
