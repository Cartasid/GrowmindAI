"""Gemini proxy endpoints ported from PhotonFlux add-on."""
from __future__ import annotations

import asyncio
import base64
import json
import math
import os
import random
import re
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

router = APIRouter(prefix="/api/gemini", tags=["gemini"])

CLIENT: Optional[genai.Client] = None
_CLIENT_TIMEOUT_MS: Optional[int] = None
_MODEL_NAME: Optional[str] = None
_RETRYABLE_API_CODES = {429, 500, 502, 503, 504}
DEFAULT_MODEL = "models/gemini-2.5-flash"


class AnalyzeImagePayload(BaseModel):
    imagesBase64: List[str]
    prompt: Optional[str] = None
    inputs: Optional[Dict[str, Any]] = None
    fullPhaseName: Optional[str] = None
    userNotes: Optional[str] = None
    lang: Optional[str] = "en"
    ppm: Optional[Dict[str, float]] = None
    journalHistory: Optional[List[Dict[str, Any]]] = None


class AnalyzeTextPayload(BaseModel):
    text: str


class StagePayload(BaseModel):
    phase: str
    daysSinceStart: int
    lang: Optional[str] = "en"


class PlanWeekTarget(BaseModel):
    phase: str
    stage: Optional[str] = None
    targets: Dict[str, float]


class PlanOptimizationPayload(BaseModel):
    lang: Optional[str] = "en"
    cultivar: Optional[str] = None
    substrate: Optional[str] = None
    waterProfile: Optional[Dict[str, float]] = None
    osmosisShare: Optional[float] = None
    weeks: List[PlanWeekTarget]


def _read_addon_options() -> Dict[str, Any]:
    try:
        with open("/data/options.json", "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def _api_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if key:
        return key
    options = _read_addon_options()
    option_key = str(options.get("gemini_api_key") or "").strip()
    if option_key:
        return option_key
    raise HTTPException(status_code=400, detail="Gemini API key not configured.")


def _seconds_to_ms(seconds: float) -> int:
    return int(math.ceil(max(1.0, seconds) * 1000.0))


def _client(timeout_seconds: Optional[float] = None) -> genai.Client:
    global CLIENT, _CLIENT_TIMEOUT_MS
    timeout_ms = _seconds_to_ms(timeout_seconds or _retry_settings()["timeout"])
    if CLIENT is None or _CLIENT_TIMEOUT_MS != timeout_ms:
        CLIENT = genai.Client(
            api_key=_api_key(),
            http_options=types.HttpOptions(api_version="v1beta", timeout=timeout_ms),
        )
        _CLIENT_TIMEOUT_MS = timeout_ms
    return CLIENT


def _reset_client() -> None:
    global CLIENT, _CLIENT_TIMEOUT_MS
    CLIENT = None
    _CLIENT_TIMEOUT_MS = None


def _model() -> str:
    global _MODEL_NAME
    if _MODEL_NAME is None:
        model = os.getenv("GEMINI_MODEL", "").strip()
        if not model:
            options = _read_addon_options()
            model = str(options.get("gemini_model") or "").strip()
        if not model:
            model = DEFAULT_MODEL
        if not model.startswith("models/"):
            model = f"models/{model}"
        _MODEL_NAME = model
    return _MODEL_NAME


def _retry_settings() -> Dict[str, Union[int, float]]:
    def _as_float(key: str, default: float) -> float:
        raw = os.getenv(key)
        if raw is None:
            return default
        try:
            return float(raw)
        except (TypeError, ValueError):
            return default

    def _as_int(key: str, default: int, minimum: int = 1) -> int:
        raw = os.getenv(key)
        if raw is None:
            return default
        try:
            return max(minimum, int(raw))
        except (TypeError, ValueError):
            return default

    return {
        "tries": _as_int("GEMINI_MAX_RETRIES", 4),
        "timeout": _as_float("GEMINI_REQUEST_TIMEOUT", 120.0),
        "initial_delay": _as_float("GEMINI_BACKOFF_INITIAL", 1.0),
        "max_delay": _as_float("GEMINI_BACKOFF_MAX", 16.0),
        "jitter_ratio": max(0.0, _as_float("GEMINI_BACKOFF_JITTER_RATIO", 0.3)),
    }


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


def _is_thinking_model(model_name: str) -> bool:
    lowered = model_name.lower()
    return "thinking" in lowered or "gemini-3" in lowered or "gemini-2.0-flash-thinking" in lowered


def _resp_text(resp: Any) -> str:
    text = getattr(resp, "text", None)
    if text:
        return text
    try:
        parts = resp.candidates[0].content.parts  # type: ignore[attr-defined]
        texts = [getattr(part, "text", "") for part in parts if getattr(part, "text", "")]
        if texts:
            return "".join(texts).strip()
    except Exception:
        pass
    return ""


def _strip_code_fences(value: str) -> str:
    value = value.strip()
    if value.startswith("```"):
        value = value.split("\n", 1)[-1]
    if value.endswith("```"):
        value = value.rsplit("\n", 1)[0]
    return value.strip()


def _extract_json(value: str) -> Optional[Any]:
    try:
        return json.loads(value)
    except Exception:
        pass
    stripped = _strip_code_fences(value)
    if stripped != value:
        try:
            return json.loads(stripped)
        except Exception:
            pass
    return None


def _strict_json_instruction(sample: str, lang_label: str) -> str:
    return (
        "Output JSON only. No markdown. No prose.\n"
        "Ensure valid, minified JSON exactly matching the schema.\n"
        f"Write explanations in {lang_label}.\n"
        f"Example:\n{sample}"
    )


async def _generate_json_with_retry(
    user_parts: List[types.Part],
    extra_instruction: str,
    max_tokens: int,
    temperature: float,
    tries: Optional[int] = None,
    request_timeout: Optional[float] = None,
) -> Tuple[Optional[dict], str]:
    retry = _retry_settings()
    attempt_limit = max(1, int(tries if tries is not None else retry["tries"]))
    timeout_sec = max(1.0, float(request_timeout if request_timeout is not None else retry["timeout"]))
    delay = float(retry["initial_delay"])
    max_delay = float(retry["max_delay"])
    jitter_ratio = float(retry["jitter_ratio"])
    client: Optional[genai.Client] = None
    last_text = ""

    for attempt in range(attempt_limit):
        if client is None:
            client = _client(timeout_sec)

        contents = types.Content(role="user", parts=user_parts + [types.Part.from_text(text=extra_instruction)])
        config: Dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "safety_settings": [
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                types.SafetySetting(category="HARM_CATEGORY_CIVIC_INTEGRITY", threshold="BLOCK_NONE"),
            ],
        }
        model_name = _model()
        if _is_thinking_model(model_name):
            budget = _env_int("GEMINI_THINKING_BUDGET", 1024)
            try:
                config["thinking_config"] = types.ThinkingConfig(include_thoughts=True, thinking_budget=budget)
            except (AttributeError, TypeError):
                pass

        try:
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(**config),
            )
        except errors.APIError as exc:
            last_text = f"APIError {exc.code}: {exc.message}"
            if exc.code in _RETRYABLE_API_CODES and attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                _reset_client()
                continue
            raise

        last_text = _resp_text(resp)
        parsed = _extract_json(last_text)
        if isinstance(parsed, dict):
            return parsed, last_text
        extra_instruction = "Return only valid minified JSON matching the schema. No extra text."
    return None, last_text


def _build_image_prompt(payload: AnalyzeImagePayload) -> str:
    lang = (payload.lang or "en").lower()
    is_german = lang.startswith("de")
    role = "Du bist ein weltweit führender Experte für den Cannabisanbau (Master Grower)." if is_german else "You are a world-class cannabis cultivation expert (Master Grower)."
    task = "Analysiere die bereitgestellten Pflanzenbilder und den Kontext mit höchster Präzision." if is_german else "Analyze the provided plant images and context with the highest precision."
    focus = "Nährstoffmängel, Krankheiten, Schädlinge, Umweltstress und allgemeine Vitalität." if is_german else "nutrient deficiencies, diseases, pests, environmental stress, and general vitality."
    labels = {
        "phase": "Wachstumsphase" if is_german else "Growth phase",
        "substrate": "Substrat" if is_german else "Substrate",
        "trend": "EC-Trend (24h)" if is_german else "EC trend (24h)",
        "ph": "pH-Drift (24h)" if is_german else "pH drift (24h)",
        "notes": "Benutzernotizen" if is_german else "User notes",
        "obs": "Beobachtungen" if is_german else "Observations",
        "ppm": "Nährstoffwerte (PPM)" if is_german else "Nutrient levels (PPM)",
    }
    inputs = payload.inputs or {}
    observed = [key for key in ["tipburn", "pale", "caMgDeficiency", "claw"] if inputs.get(key)]
    observation_context = ", ".join(observed) or ("Keine" if is_german else "None")
    notes = payload.userNotes or ("Keine" if is_german else "None")
    parts = [
        role,
        task,
        f"Focus: {focus}",
        f"{labels['phase']}: {payload.fullPhaseName or ''}",
        f"{labels['substrate']}: {inputs.get('substrate', '')}",
        f"{labels['trend']}: {inputs.get('trend', '')}",
        f"{labels['ph']}: {inputs.get('phDrift', '')}",
        f"{labels['notes']}: {notes}",
        f"{labels['obs']}: {observation_context}",
    ]
    if payload.ppm:
        parts.append(f"{labels['ppm']}: {payload.ppm}")
    format_instruction = "GIB NUR MINIFIZIERTES JSON ZURÜCK (KEIN MARKDOWN, KEIN PROSA-TEXT)." if is_german else "RETURN ONLY MINIFIED JSON (NO MARKDOWN, NO PROSE)."
    parts.append(format_instruction)
    parts.append("Keys: potentialIssues(array[{issue,confidence,explanation}]), recommendedActions(array[string]), disclaimer(string).")
    parts.append(f"Language: {'Deutsch' if is_german else 'English'}")
    return "\n".join(parts)


def _decode_data_uri_or_b64(value: str) -> Tuple[bytes, str]:
    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image payload")

    mime_type = "image/jpeg"
    payload = raw

    match = re.match(r"^data:([^;]+);base64,(.*)$", raw, flags=re.IGNORECASE | re.DOTALL)
    if match:
        mime_type = match.group(1).strip() or mime_type
        payload = match.group(2).strip()

    try:
        decoded = base64.b64decode(payload, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image payload: {exc}") from exc

    if not decoded:
        raise HTTPException(status_code=400, detail="Decoded image is empty")
    return decoded, mime_type


def _build_stage_prompt(payload: StagePayload) -> Tuple[List[types.Part], str]:
    lang = (payload.lang or "en").lower()
    is_german = lang.startswith("de")
    role = (
        "Du bist ein erfahrener Grow-Coach und kategorisierst das Entwicklungsstadium einer Cannabispflanze."
        if is_german
        else "You are an expert grow coach who classifies cannabis plant development stage."
    )
    prompt = (
        f"{role}\n"
        f"Phase label: {payload.phase}\n"
        f"Days since start: {payload.daysSinceStart}\n"
        "Return JSON with keys: stage(one of Vegetative|Flowering|Ripening), confidence(High|Medium|Low), reasoning(string).\n"
        "Return JSON only."
    )
    language_label = "German" if is_german else "English"
    example = '{"stage":"Vegetative","confidence":"High","reasoning":"..."}'
    extra = _strict_json_instruction(example, language_label)
    return [types.Part.from_text(text=prompt)], extra


def _build_optimize_prompt(payload: PlanOptimizationPayload) -> Tuple[List[types.Part], str]:
    lang = (payload.lang or "en").lower()
    is_german = lang.startswith("de")
    intro = (
        "Du bist ein Master-Grower und optimierst ein Nährstoffschema für Cannabis."
        if is_german
        else "You are a master grower optimizing a cannabis nutrient schedule."
    )
    meta = {
        "cultivar": payload.cultivar,
        "substrate": payload.substrate,
        "waterProfile": payload.waterProfile,
        "osmosisShare": payload.osmosisShare,
        "weeks": [week.model_dump() for week in payload.weeks],
    }
    prompt = (
        f"{intro}\n"
        "Given weekly target elemental PPMs, propose a weekly dosing plan for base nutrients A, X, BZ plus target pH/EC.\n"
        "Return JSON with keys: plan(array[ {phase,stage,A,X,BZ,pH,EC,achieved?,diff?,notes?} ]), summary(string optional).\n"
        "Return JSON only.\n"
        f"INPUT:{json.dumps(meta, ensure_ascii=False)}"
    )
    language_label = "German" if is_german else "English"
    example = '{"plan":[{"phase":"VEG","stage":"Vegetative","A":2.0,"X":1.0,"BZ":0.5,"pH":"5.8","EC":"1.6"}],"summary":"..."}'
    extra = _strict_json_instruction(example, language_label)
    return [types.Part.from_text(text=prompt)], extra


async def _generate_text_with_retry(
    prompt: str,
    max_tokens: int,
    temperature: float,
    tries: Optional[int] = None,
    request_timeout: Optional[float] = None,
) -> str:
    retry = _retry_settings()
    attempt_limit = max(1, int(tries if tries is not None else retry["tries"]))
    timeout_sec = max(1.0, float(request_timeout if request_timeout is not None else retry["timeout"]))
    delay = float(retry["initial_delay"])
    max_delay = float(retry["max_delay"])
    jitter_ratio = float(retry["jitter_ratio"])
    client: Optional[genai.Client] = None
    last_text = ""

    for attempt in range(attempt_limit):
        if client is None:
            client = _client(timeout_sec)

        model_name = _model()
        config: Dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        if _is_thinking_model(model_name):
            budget = _env_int("GEMINI_THINKING_BUDGET", 1024)
            try:
                config["thinking_config"] = types.ThinkingConfig(include_thoughts=True, thinking_budget=budget)
            except (AttributeError, TypeError):
                pass

        try:
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=types.Content(role="user", parts=[types.Part.from_text(text=prompt)]),
                config=types.GenerateContentConfig(**config),
            )
        except errors.APIError as exc:
            last_text = f"APIError {exc.code}: {exc.message}"
            if exc.code in _RETRYABLE_API_CODES and attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                _reset_client()
                continue
            raise

        last_text = _resp_text(resp)
        if last_text:
            return last_text
    return last_text


@router.post("/analyze-image")
async def analyze_image(payload: AnalyzeImagePayload):
    _ = _api_key()
    if not payload.imagesBase64:
        return JSONResponse({"error": "No images provided."}, status_code=400)
    instruction = payload.prompt or _build_image_prompt(payload)
    user_parts = [types.Part.from_text(text=instruction)]
    for image in payload.imagesBase64:
        img_bytes, mime = _decode_data_uri_or_b64(image)
        user_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))
    language_label = "German" if (payload.lang or "").lower().startswith("de") else "English"
    example = '{"potentialIssues":[{"issue":"Example","confidence":"High","explanation":"..."}],"recommendedActions":["..."],"disclaimer":"..."}'
    extra = _strict_json_instruction(example, language_label)
    try:
        parsed, raw = await _generate_json_with_retry(user_parts, extra_instruction=extra, max_tokens=2048, temperature=0.2)
        if isinstance(parsed, dict) and isinstance(parsed.get("potentialIssues"), list):
            return parsed
        fallback = _strip_code_fences(raw)
        if not fallback:
            return JSONResponse({"error": "No model output."}, status_code=502)
        return {"potentialIssues": [], "recommendedActions": [], "disclaimer": fallback}
    except errors.APIError as exc:
        return JSONResponse({"error": f"APIError {exc.code}: {exc.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@router.post("/analyze-stage")
async def analyze_stage(payload: StagePayload):
    _ = _api_key()
    user_parts, extra = _build_stage_prompt(payload)
    try:
        parsed, raw = await _generate_json_with_retry(user_parts, extra_instruction=extra, max_tokens=768, temperature=0.2)
        if isinstance(parsed, dict) and parsed.get("stage"):
            return parsed
        fallback = _strip_code_fences(raw)
        if not fallback:
            return JSONResponse({"error": "No model output."}, status_code=502)
        return {"stage": "Vegetative", "confidence": "Low", "reasoning": fallback}
    except errors.APIError as exc:
        return JSONResponse({"error": f"APIError {exc.code}: {exc.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@router.post("/optimize-plan")
async def optimize_plan(payload: PlanOptimizationPayload):
    _ = _api_key()
    if not payload.weeks:
        return JSONResponse({"error": "No week targets provided."}, status_code=400)
    user_parts, extra = _build_optimize_prompt(payload)
    try:
        parsed, raw = await _generate_json_with_retry(user_parts, extra_instruction=extra, max_tokens=2048, temperature=0.3)
        if isinstance(parsed, dict) and isinstance(parsed.get("plan"), list):
            return parsed
        fallback = _strip_code_fences(raw)
        if not fallback:
            return JSONResponse({"error": "No model output."}, status_code=502)
        return {"plan": [], "summary": fallback}
    except errors.APIError as exc:
        return JSONResponse({"error": f"APIError {exc.code}: {exc.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@router.post("/analyze-text")
async def analyze_text(payload: AnalyzeTextPayload):
    _ = _api_key()
    prompt = payload.text.strip()
    if not prompt:
        return JSONResponse({"error": "Empty prompt."}, status_code=400)
    try:
        result = await _generate_text_with_retry(prompt, max_tokens=1024, temperature=0.4)
        return {"result": result}
    except errors.APIError as exc:
        return JSONResponse({"error": f"APIError {exc.code}: {exc.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)
