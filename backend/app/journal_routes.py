"""Journal endpoints mirroring PhotonFlux functionality."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from .sanitization import InputSanitizer
from .storage import get_collection_key, set_collection_key
from .enums import JournalEntryType, EntryPriority, validate_enum_value

router = APIRouter(prefix="/api/journal", tags=["journal"])

JOURNAL_COLLECTION = "photonfluxJournal"

# Export valid entry types for tests and clients
VALID_ENTRY_TYPES = {"Observation", "Feeding", "Pest", "Training", "Harvest"}


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

    @field_validator('plantHeight', 'temp', 'humidity', 'ec', 'ph', 'ppfd', 'co2', 
                     'rootTemp', 'leafTemp', 'vpd', 'vwc', 'soilEc', mode='before')
    @classmethod
    def validate_metrics(cls, v):
        if v is None:
            return None
        try:
            val = float(v)
            if val < 0:
                raise ValueError("Metrics must be non-negative")
            return val
        except (TypeError, ValueError) as e:
            raise ValueError(f"Invalid metric value: {v}")


class FeedingDetails(BaseModel):
    A: float = Field(ge=0)
    X: float = Field(ge=0)
    BZ: float = Field(ge=0)
    EC: str
    pH: str

    @field_validator('EC', 'pH', mode='before')
    @classmethod
    def validate_strings(cls, v):
        if not isinstance(v, str) or len(v) > 100:
            raise ValueError("EC and pH must be short strings")
        return v


class Adjustments(BaseModel):
    trend: Optional[str] = None
    tipburn: Optional[str] = None
    pale: Optional[str] = None
    caMgDeficiency: Optional[str] = None
    claw: Optional[str] = None
    phDrift: Optional[str] = None


class HarvestDetails(BaseModel):
    wetWeight: Optional[float] = Field(default=None, ge=0)
    dryWeight: Optional[float] = Field(default=None, ge=0)
    trimWeight: Optional[float] = Field(default=None, ge=0)
    qualityRating: Optional[float] = Field(default=None, ge=1, le=5)
    densityRating: Optional[float] = Field(default=None, ge=1, le=5)
    terpenProfile: Optional[str] = None
    resinProduction: Optional[str] = None
    dryingNotes: Optional[str] = None


class JournalEntryPayload(BaseModel):
    id: Optional[str] = None
    growId: Optional[str] = None
    date: str
    phase: str = Field(..., max_length=100)
    entryType: str = Field(..., max_length=50)
    priority: str = Field(..., max_length=20)
    notes: str = Field("", max_length=5000)
    images: List[str] = Field(default_factory=list, max_length=100)  # Max 100 images
    tags: List[str] = Field(default_factory=list, max_length=50)  # Max 50 tags
    metrics: JournalMetrics = Field(default_factory=JournalMetrics)
    feedingDetails: Optional[FeedingDetails] = None
    adjustments: Optional[Adjustments] = None
    aiAnalysisResult: Optional[Dict[str, Any]] = None
    harvestDetails: Optional[HarvestDetails] = None
    relatedEntryId: Optional[str] = None

    @field_validator('entryType', mode='before')
    @classmethod
    def validate_entry_type(cls, v):
        valid_types = JournalEntryType.valid_values()
        if v not in valid_types:
            raise ValueError(f"Invalid entryType. Must be one of {valid_types}")
        return v

    @field_validator('priority', mode='before')
    @classmethod
    def validate_priority(cls, v):
        valid_priorities = EntryPriority.valid_values()
        if v not in valid_priorities:
            raise ValueError(f"Invalid priority. Must be one of {valid_priorities}")
        return v

    @field_validator('date', mode='before')
    @classmethod
    def validate_date(cls, v):
        if not v or not str(v).strip():
            raise ValueError("Date is required")
        # Simple ISO format check
        try:
            from datetime import datetime
            # Try to parse as ISO 8601 date or datetime
            if len(str(v)) >= 10:
                parts = str(v).split('T')
                date_part = parts[0]
                year, month, day = date_part.split('-')
                int(year), int(month), int(day)
            else:
                raise ValueError("Date must be ISO 8601 format")
        except (ValueError, IndexError):
            raise ValueError("Date must be ISO 8601 format (e.g., 2026-02-06 or 2026-02-06T10:30:00)")
        return v

    @field_validator('notes', 'phase', mode='before')
    @classmethod
    def validate_text_fields(cls, v):
        if v is None:
            return v
        if isinstance(v, str) and len(v) > 5000:
            raise ValueError("Text field too long (max 5000 characters)")
        return v



class JournalBulkPayload(BaseModel):
    entries: List[JournalEntryPayload]


class JournalEntryResponse(BaseModel):
    entry: JournalEntryPayload


def _validate_grow_id(grow_id: str) -> str:
    """Validate and sanitize grow_id."""
    try:
        return InputSanitizer.sanitize_identifier(grow_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid grow_id: {str(e)}")


def _journal_key(grow_id: str) -> str:
    validated_id = _validate_grow_id(grow_id)
    return f"journal_{validated_id}"


def _load_entries(grow_id: str) -> List[Dict[str, Any]]:
    validated_id = _validate_grow_id(grow_id)
    return get_collection_key(JOURNAL_COLLECTION, f"journal_{validated_id}", [])


def _save_entries(grow_id: str, entries: List[Dict[str, Any]]) -> None:
    validated_id = _validate_grow_id(grow_id)
    set_collection_key(JOURNAL_COLLECTION, f"journal_{validated_id}", entries)


def _normalize_entry(payload: JournalEntryPayload) -> Dict[str, Any]:
    """Normalize and validate journal entry."""
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
    """Read all journal entries for a grow."""
    try:
        entries = _load_entries(grow_id)
        sorted_entries = sorted(entries, key=lambda entry: entry.get("date", ""), reverse=True)
        return {"entries": sorted_entries}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read journal: {str(e)}")


@router.post("/{grow_id}")
def save_journal(grow_id: str, payload: JournalBulkPayload):
    """Save journal entries (bulk)."""
    try:
        if not payload.entries:
            raise ValueError("At least one entry is required")
        
        normalized = [_normalize_entry(entry) for entry in payload.entries]
        _save_entries(grow_id, normalized)
        return {"count": len(normalized)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save journal: {str(e)}")


@router.post("/{grow_id}/entry")
def add_entry(grow_id: str, payload: JournalEntryPayload):
    """Add a single journal entry."""
    try:
        entries = _load_entries(grow_id)
        normalized = _normalize_entry(payload)
        entries.insert(0, normalized)
        _save_entries(grow_id, entries)
        return JournalEntryResponse(entry=JournalEntryPayload(**normalized))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to add entry: {str(e)}")


@router.delete("/{grow_id}/entry/{entry_id}")
def delete_entry(grow_id: str, entry_id: str):
    """Delete a journal entry by ID."""
    try:
        # Validate entry_id format (UUID or string ID)
        if not entry_id or len(entry_id) > 256:
            raise ValueError("Invalid entry_id")
        
        entries = _load_entries(grow_id)
        filtered = [entry for entry in entries if entry.get("id") != entry_id]
        
        if len(filtered) == len(entries):
            raise HTTPException(status_code=404, detail="Entry not found")
        
        _save_entries(grow_id, filtered)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete entry: {str(e)}")
