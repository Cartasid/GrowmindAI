"""Time-series data endpoints backed by InfluxDB."""
from __future__ import annotations

import csv
import io
import os
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/timeseries", tags=["timeseries"])


class TimeSeriesQuery(BaseModel):
    entity_ids: List[str] = Field(..., min_items=1, max_items=20)
    range_hours: int = Field(168, ge=1, le=720)
    interval_minutes: int = Field(15, ge=1, le=1440)


def _influx_settings() -> Optional[Dict[str, str]]:
    url = os.getenv("INFLUX_URL", "").strip()
    token = os.getenv("INFLUX_TOKEN", "").strip()
    org = os.getenv("INFLUX_ORG", "").strip()
    bucket = os.getenv("INFLUX_BUCKET", "").strip()
    if not (url and token and org and bucket):
        return None
    return {
        "url": url.rstrip("/"),
        "token": token,
        "org": org,
        "bucket": bucket,
    }


def _build_flux(entity_ids: List[str], range_hours: int, interval_minutes: int, bucket: str) -> str:
    entity_list = ",".join([f'"{eid}"' for eid in entity_ids])
    return (
        f"from(bucket: \"{bucket}\")"
        f" |> range(start: -{range_hours}h)"
        " |> filter(fn: (r) => r._measurement == \"state\")"
        " |> filter(fn: (r) => r._field == \"value\")"
        f" |> filter(fn: (r) => contains(value: r.entity_id, set: [{entity_list}]))"
        f" |> aggregateWindow(every: {interval_minutes}m, fn: mean, createEmpty: false)"
        " |> keep(columns: [\"_time\", \"_value\", \"entity_id\"])")


def _parse_influx_csv(payload: str) -> Dict[str, List[Dict[str, Any]]]:
    series: Dict[str, List[Dict[str, Any]]] = {}
    header: Optional[List[str]] = None
    reader = csv.reader(io.StringIO(payload))
    for row in reader:
        if not row:
            continue
        if row[0].startswith("#"):
            continue
        if "_time" in row and "_value" in row:
            header = row
            continue
        if header is None:
            continue
        record = {header[idx]: row[idx] for idx in range(min(len(header), len(row)))}
        entity_id = record.get("entity_id")
        if not entity_id:
            continue
        raw_value = record.get("_value")
        raw_time = record.get("_time")
        try:
            value = float(raw_value) if raw_value not in (None, "") else None
        except (TypeError, ValueError):
            value = None
        if value is None or raw_time is None:
            continue
        series.setdefault(entity_id, []).append({"t": raw_time, "v": value})
    return series


@router.post("/query")
async def query_timeseries(payload: TimeSeriesQuery) -> Dict[str, Any]:
    settings = _influx_settings()
    if not settings:
        raise HTTPException(status_code=501, detail="InfluxDB not configured")
    flux = _build_flux(
        payload.entity_ids,
        payload.range_hours,
        payload.interval_minutes,
        settings["bucket"],
    )
    url = f"{settings['url']}/api/v2/query?org={quote(settings['org'])}"
    headers = {
        "Authorization": f"Token {settings['token']}",
        "Content-Type": "application/json",
        "Accept": "text/csv",
    }
    body = {"query": flux, "type": "flux"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        response = await client.post(url, headers=headers, json=body)
    if not response.is_success:
        detail = response.text
        raise HTTPException(status_code=502, detail=f"Influx query failed: {detail}")
    series = _parse_influx_csv(response.text)
    return {
        "series": series,
        "range_hours": payload.range_hours,
        "interval_minutes": payload.interval_minutes,
    }
