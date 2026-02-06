"""Gemini proxy endpoints ported from PhotonFlux add-on."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import os
import random
import re
import html
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, field_validator

router = APIRouter(prefix="/api/gemini", tags=["gemini"])
logger = logging.getLogger(__name__)
_RETRYABLE_API_CODES = {429, 500, 502, 503, 504}
DEFAULT_MODEL = "models/gemini-2.5-flash"
DEFAULT_SAFETY_THRESHOLD = "BLOCK_MEDIUM_AND_ABOVE"


def _sanitize_text(text: Optional[str], max_length: int = 5000) -> Optional[str]:
    """Sanitize text to prevent prompt injection and limit size.
    
    This doesn't remove content, but ensures no control characters that could
    trick the model are present, and enforces reasonable size limits.
    """
    if text is None:
        return None
    text = str(text).strip()
    if not text:
        return None
    # Limit length
    if len(text) > max_length:
        text = text[:max_length].rstrip()
    # Remove null bytes and other control characters (keep newlines/tabs)
    text = ''.join(c for c in text if ord(c) >= 32 or c in '\n\t\r')
    return text


class AnalyzeImagePayload(BaseModel):
    imagesBase64: List[str]
    prompt: Optional[str] = None
    inputs: Optional[Dict[str, Any]] = None
    fullPhaseName: Optional[str] = None
    userNotes: Optional[str] = None
    lang: Optional[str] = "en"
    ppm: Optional[Dict[str, float]] = None
    journalHistory: Optional[List[Dict[str, Any]]] = None
    
    @field_validator('prompt', 'userNotes')
    @classmethod
    def sanitize_text_fields(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize text inputs to prevent prompt injection."""
        return _sanitize_text(v)
    
    @field_validator('lang')
    @classmethod
    def validate_lang(cls, v: str) -> str:
        """Validate language is reasonable identifier."""
        if not v or not isinstance(v, str):
            return "en"
        # Allow ISO 639-1 codes (e.g., en, de, fr) and regional variants (en-US, de-DE)
        if not re.match(r'^[a-z]{2}(-[A-Z]{2})?$', v):
            logger.warning("Invalid language code: %s, using 'en'", v)
            return "en"
        return v


class AnalyzeTextPayload(BaseModel):
    text: str
    
    @field_validator('text')
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        """Sanitize text input."""
        sanitized = _sanitize_text(v)
        if not sanitized:
            raise ValueError("text cannot be empty or contain only control characters")
        return sanitized


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
    timeout_ms = _seconds_to_ms(timeout_seconds or _retry_settings()["timeout"])
    return genai.Client(
        api_key=_api_key(),
        http_options=types.HttpOptions(api_version="v1beta", timeout=timeout_ms),
    )


def _model() -> str:
    model = os.getenv("GEMINI_MODEL", "").strip()
    if not model:
        options = _read_addon_options()
        model = str(options.get("gemini_model") or "").strip()
    if not model:
        model = DEFAULT_MODEL
    if not model.startswith("models/"):
        model = f"models/{model}"
    return model


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


ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = _env_int("GEMINI_MAX_IMAGE_BYTES", 5_000_000, minimum=1)
MAX_IMAGE_COUNT = _env_int("GEMINI_MAX_IMAGE_COUNT", 4, minimum=1)


def _safety_threshold() -> str:
    raw = os.getenv("GEMINI_SAFETY_THRESHOLD", DEFAULT_SAFETY_THRESHOLD).strip()
    return raw or DEFAULT_SAFETY_THRESHOLD


def _safety_settings() -> List[types.SafetySetting]:
    threshold = _safety_threshold()
    return [
        types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold=threshold),
        types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold=threshold),
        types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold=threshold),
        types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold=threshold),
        types.SafetySetting(category="HARM_CATEGORY_CIVIC_INTEGRITY", threshold=threshold),
    ]


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
    except (json.JSONDecodeError, TypeError, ValueError):
        # JSON parse failed, try stripping code fences
        pass
    stripped = _strip_code_fences(value)
    if stripped != value:
        try:
            return json.loads(stripped)
        except (json.JSONDecodeError, TypeError, ValueError):
            # Even stripped version invalid
            logger.debug("Failed to parse JSON from value: %s", value[:100])
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
    """Generate JSON response with comprehensive retry and error handling."""
    retry = _retry_settings()
    attempt_limit = max(1, int(tries if tries is not None else retry["tries"]))
    timeout_sec = max(1.0, float(request_timeout if request_timeout is not None else retry["timeout"]))
    delay = float(retry["initial_delay"])
    max_delay = float(retry["max_delay"])
    jitter_ratio = float(retry["jitter_ratio"])
    client: Optional[genai.Client] = None
    last_text = ""
    last_error: Optional[Exception] = None

    for attempt in range(attempt_limit):
        if client is None:
            client = _client(timeout_sec)

        contents = types.Content(role="user", parts=user_parts + [types.Part.from_text(text=extra_instruction)])
        config: Dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "safety_settings": _safety_settings(),
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
            last_error = exc
            last_text = f"APIError {exc.code}: {exc.message}"
            if exc.code in _RETRYABLE_API_CODES and attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                continue
            raise HTTPException(status_code=502, detail="Gemini API error") from exc
        except asyncio.TimeoutError as exc:
            last_error = exc
            last_text = "Request timeout"
            if attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                logger.debug(f"Timeout on attempt {attempt + 1}/{attempt_limit}, retrying...")
                continue
            raise HTTPException(status_code=504, detail="Request timeout") from exc
        except (OSError, IOError) as exc:
            # Network connection errors
            last_error = exc
            last_text = f"Connection error: {str(exc)}"
            if attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                logger.debug(f"Connection error on attempt {attempt + 1}/{attempt_limit}, retrying...")
                continue
            raise HTTPException(status_code=502, detail="Network error") from exc
        except Exception as exc:
            # Unexpected errors
            last_error = exc
            logger.exception(f"Unexpected error in _generate_json_with_retry (attempt {attempt + 1}/{attempt_limit})")
            if attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                continue
            raise HTTPException(status_code=500, detail="Processing error") from exc

        last_text = _resp_text(resp)
        parsed = _extract_json(last_text)
        if isinstance(parsed, dict):
            return parsed, last_text
        extra_instruction = "Return only valid minified JSON matching the schema. No extra text."
    
    logger.error(f"Failed to get JSON after {attempt_limit} attempts. Last error: {last_error}")
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

    mime_type = mime_type.lower().strip()
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    if mime_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    payload = re.sub(r"\s+", "", payload)
    max_payload_len = int(MAX_IMAGE_BYTES * 4 / 3) + 4
    if len(payload) > max_payload_len:
        raise HTTPException(status_code=400, detail="Image payload too large")

    try:
        decoded = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image payload: {exc}") from exc

    if not decoded:
        raise HTTPException(status_code=400, detail="Decoded image is empty")
    if len(decoded) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds size limit")
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
    """Generate text response with comprehensive retry and error handling."""
    retry = _retry_settings()
    attempt_limit = max(1, int(tries if tries is not None else retry["tries"]))
    timeout_sec = max(1.0, float(request_timeout if request_timeout is not None else retry["timeout"]))
    delay = float(retry["initial_delay"])
    max_delay = float(retry["max_delay"])
    jitter_ratio = float(retry["jitter_ratio"])
    client: Optional[genai.Client] = None
    last_text = ""
    last_error: Optional[Exception] = None

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
            last_error = exc
            last_text = f"APIError {exc.code}: {exc.message}"
            if exc.code in _RETRYABLE_API_CODES and attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                continue
            raise HTTPException(status_code=502, detail="Gemini API error") from exc
        except asyncio.TimeoutError as exc:
            last_error = exc
            last_text = "Request timeout"
            if attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                logger.debug(f"Timeout on attempt {attempt + 1}/{attempt_limit}, retrying...")
                continue
            raise HTTPException(status_code=504, detail="Request timeout") from exc
        except (OSError, IOError) as exc:
            last_error = exc
            last_text = f"Connection error: {str(exc)}"
            if attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                logger.debug(f"Connection error on attempt {attempt + 1}/{attempt_limit}, retrying...")
                continue
            raise HTTPException(status_code=502, detail="Network error") from exc
        except Exception as exc:
            last_error = exc
            logger.exception(f"Unexpected error in _generate_text_with_retry (attempt {attempt + 1}/{attempt_limit})")
            if attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                continue
            raise HTTPException(status_code=500, detail="Processing error") from exc

        last_text = _resp_text(resp)
        if last_text:
            return last_text
    logger.error(f"Failed to get text after {attempt_limit} attempts. Last error: {last_error}")
    return last_text


@router.post("/analyze-image")
async def analyze_image(payload: AnalyzeImagePayload):
    _ = _api_key()
    if not payload.imagesBase64:
        return JSONResponse({"error": "No images provided."}, status_code=400)
    if len(payload.imagesBase64) > MAX_IMAGE_COUNT:
        return JSONResponse({"error": "Too many images provided."}, status_code=400)
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
        logger.warning("Gemini analyze-image failed (%s)", exc.code)
        return JSONResponse({"error": "Gemini API error."}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gemini analyze-image failed")
        return JSONResponse({"error": "Failed to analyze image."}, status_code=500)


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
        logger.warning("Gemini analyze-stage failed (%s)", exc.code)
        return JSONResponse({"error": "Gemini API error."}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gemini analyze-stage failed")
        return JSONResponse({"error": "Failed to analyze stage."}, status_code=500)


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
        logger.warning("Gemini optimize-plan failed (%s)", exc.code)
        return JSONResponse({"error": "Gemini API error."}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gemini optimize-plan failed")
        return JSONResponse({"error": "Failed to optimize plan."}, status_code=500)


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
        logger.warning("Gemini analyze-text failed (%s)", exc.code)
        return JSONResponse({"error": "Gemini API error."}, status_code=502)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gemini analyze-text failed")
        return JSONResponse({"error": "Failed to analyze text."}, status_code=500)
