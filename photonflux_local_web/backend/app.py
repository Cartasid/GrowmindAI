#!/usr/bin/env python3
import os
import logging
import json
import base64
import re
import time
import math
import random
from typing import Any, Dict, List, Optional, Tuple, Union

import portalocker

from google import genai
from google.genai import types, errors

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------- App / Static ----------
logger = logging.getLogger(__name__)
ROOT_PATH = os.getenv("INGRESS_PATH", "")
PUBLIC_DIR = os.getenv("PUBLIC_DIR", os.path.join(os.path.dirname(__file__), "public"))

def _parse_csv_env(name: str) -> List[str]:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]

CORS_ALLOWED_ORIGINS = _parse_csv_env("CORS_ALLOWED_ORIGINS")
if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = []
    logger.error("CORS_ALLOWED_ORIGINS not set; CORS disabled until configured.")

app = FastAPI(root_path=ROOT_PATH)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_headers=["*"],
    allow_methods=["*"],
)

# ---------- Persistence ----------
def _get_data_file() -> str:
    return os.getenv("DATA_FILE", "/data/persist.json")

LOCK_TIMEOUT = 10.0


def _store_lock() -> portalocker.Lock:
    return portalocker.Lock(f"{_get_data_file()}.lock", timeout=LOCK_TIMEOUT)


def _ensure_store_dir() -> None:
    directory = os.path.dirname(_get_data_file())
    if directory:
        os.makedirs(directory, exist_ok=True)


def _read_store_unlocked() -> Dict[str, Dict[str, Any]]:
    data_file = _get_data_file()
    try:
        with open(data_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _write_store_unlocked(data: Dict[str, Dict[str, Any]]) -> None:
    data_file = _get_data_file()
    try:
        with open(data_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        logger.exception("Failed to write store to %s: %s", data_file, exc)


def _load_store() -> Dict[str, Dict[str, Any]]:
    _ensure_store_dir()
    with _store_lock():
        return _read_store_unlocked()


def _save_store(data: Dict[str, Dict[str, Any]]) -> None:
    _ensure_store_dir()
    with _store_lock():
        _write_store_unlocked(data)

# ---------- Gemini client ----------
CLIENT: Optional[genai.Client] = None
_CLIENT_TIMEOUT_MS: Optional[int] = None  # store milliseconds
_MODEL_NAME: Optional[str] = None
_RETRYABLE_API_CODES = {429, 500, 502, 503, 504}


def _reset_client() -> None:
    global CLIENT, _CLIENT_TIMEOUT_MS
    CLIENT = None
    _CLIENT_TIMEOUT_MS = None


def _api_key() -> str:
    k = os.getenv("GEMINI_API_KEY", "").strip()
    if k:
        return k
    try:
        with open("/data/options.json", "r", encoding="utf-8") as f:
            opts = json.load(f)
            k = str(opts.get("gemini_api_key") or "").strip()
            if k:
                return k
    except Exception:
        pass
    raise HTTPException(status_code=400, detail="Gemini API key not configured.")


def _seconds_to_ms(seconds: float) -> int:
    # HttpOptions.timeout is in milliseconds.
    return int(math.ceil(max(1.0, float(seconds)) * 1000.0))


def _client(timeout_seconds: Optional[float] = None, *, timeout: Optional[float] = None) -> genai.Client:
    """Create or reuse a singleton client. Recreate if timeout changes."""
    global CLIENT, _CLIENT_TIMEOUT_MS
    if timeout is not None:
        if timeout_seconds is not None:
            raise TypeError("Specify either timeout_seconds or timeout, not both.")
        timeout_seconds = timeout

    # desired timeout in ms
    if timeout_seconds is not None:
        desired_timeout_ms = _seconds_to_ms(timeout_seconds)
    elif _CLIENT_TIMEOUT_MS is not None:
        desired_timeout_ms = _CLIENT_TIMEOUT_MS
    else:
        desired_timeout_ms = _seconds_to_ms(_retry_settings()["timeout"])  # default seconds -> ms

    if CLIENT is None or _CLIENT_TIMEOUT_MS != desired_timeout_ms:
        CLIENT = genai.Client(
            api_key=_api_key(),
            http_options=types.HttpOptions(
                api_version="v1beta",  # needed for JSON mode and latest features
                timeout=desired_timeout_ms,
            ),
        )
        _CLIENT_TIMEOUT_MS = desired_timeout_ms
    return CLIENT


DEFAULT_MODEL = "models/gemini-2.5-flash"


def _model() -> str:
    global _MODEL_NAME
    if _MODEL_NAME is None:
        m = os.getenv("GEMINI_MODEL", "").strip()
        if not m:
            try:
                with open("/data/options.json", "r", encoding="utf-8") as f:
                    opts = json.load(f)
                    m = str(opts.get("gemini_model") or "").strip()
            except Exception:
                pass
        if not m:
            m = DEFAULT_MODEL
        if not m.startswith("models/"):
            m = f"models/{m}"
        _MODEL_NAME = m
    return _MODEL_NAME

# ---------- Schemas (requests) ----------
class AnalyzeImagePayload(BaseModel):
    imagesBase64: List[str]
    prompt: Optional[str] = None
    inputs: Optional[Dict[str, Any]] = None
    fullPhaseName: Optional[str] = None
    userNotes: Optional[str] = None
    lang: Optional[str] = "en"
    ppm: Optional[Dict[str, float]] = None


class AnalyzeTextPayload(BaseModel):
    text: str


class StagePayload(BaseModel):
    phase: str
    daysSinceStart: int
    lang: Optional[str] = "en"


class StorePayload(BaseModel):
    data: Any


class PlanWeekTarget(BaseModel):
    phase: str
    stage: Optional[str] = None
    targets: Dict[str, float]


class PlanOptimizationPayload(BaseModel):
    lang: Optional[str] = "en"
    cultivar: Optional[str] = None
    substrate: str
    waterProfile: Optional[Dict[str, float]] = None
    osmosisShare: Optional[float] = None
    weeks: List[PlanWeekTarget]

# ---------- Utils ----------
def _resp_text(resp: Any) -> str:
    t = getattr(resp, "text", None)
    if t:
        return t
    try:
        parts = resp.candidates[0].content.parts  # type: ignore[attr-defined]
        texts = [getattr(p, "text", "") for p in parts if getattr(p, "text", "")]
        if texts:
            return "".join(texts).strip()
    except Exception:
        pass
    return ""


def _decode_data_uri_or_b64(s: str) -> Tuple[bytes, str]:
    mime = "image/png"
    raw = s
    if isinstance(s, str) and s.startswith("data:"):
        try:
            header, inner = s.split(",", 1)
            base = header.split(";")[0]
            mime = base.split(":")[1] if ":" in base else mime
            raw = inner
        except Exception:
            raw = s
    try:
        img_bytes = base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload.")
    return img_bytes, mime


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[\w-]*\n", "", s, count=1, flags=re.MULTILINE)
    if s.endswith("```"):
        s = re.sub(r"\n```$", "", s, count=1, flags=re.MULTILINE)
    return s.strip()


def _extract_json(s: str) -> Optional[Any]:
    try:
        return json.loads(s)
    except Exception:
        pass
    s2 = _strip_code_fences(s)
    if s2 != s:
        try:
            return json.loads(s2)
        except Exception:
            pass
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        stack = 0
        start = -1
        for i, ch in enumerate(s):
            if ch == open_ch:
                if stack == 0:
                    start = i
                stack += 1
            elif ch == close_ch and stack:
                stack -= 1
                if stack == 0 and start != -1:
                    candidate = s[start:i + 1]
                    try:
                        return json.loads(candidate)
                    except Exception:
                        pass
    return None

# ---------- Prompt helpers ----------
def _flag_is_active(value: Any) -> bool:
    """Return True when a toggle-like value represents an active state."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized:
            return False
        return normalized in {"yes", "true", "1", "active", "on"}
    return False


def _build_image_prompt(payload: AnalyzeImagePayload) -> str:
    lang = (payload.lang or "en").lower()
    is_german = lang.startswith("de")

    if is_german:
        role = "Du bist ein weltweit führender Experte für den Cannabisanbau (Master Grower)."
        task = "Analysiere die bereitgestellten Pflanzenbilder und den Kontext mit höchster Präzision."
        fields = "Nährstoffmängel, Krankheiten, Schädlinge, Umweltstress und allgemeine Vitalität."
        format_instruction = "GIB NUR MINIFIZIERTES JSON ZURÜCK (KEIN MARKDOWN, KEIN PROSA-TEXT)."
        labels = {
            "phase": "Wachstumsphase", "substrate": "Substrat", "trend": "EC-Trend (24h)",
            "ph": "pH-Drift (24h)", "notes": "Benutzernotizen", "obs": "Beobachtungen", "ppm": "Nährstoffwerte (PPM)"
        }
    else:
        role = "You are a world-class cannabis cultivation expert (Master Grower)."
        task = "Analyze the provided plant images and context with the highest precision."
        fields = "nutrient deficiencies, diseases, pests, environmental stress, and general vitality."
        format_instruction = "RETURN ONLY MINIFIED JSON (NO MARKDOWN, NO PROSE)."
        labels = {
            "phase": "Growth phase", "substrate": "Substrate", "trend": "EC trend (24h)",
            "ph": "pH drift (24h)", "notes": "User notes", "obs": "Observations", "ppm": "Nutrient levels (PPM)"
        }

    inputs = payload.inputs or {}
    observations = [
        key
        for key in ["tipburn", "pale", "caMgDeficiency", "claw"]
        if _flag_is_active(inputs.get(key))
    ]
    observation_context = ", ".join(observations) or ("Keine" if is_german else "None")

    parts = [
        role,
        task,
        f"{('Fokusbereiche' if is_german else 'Focus areas')}: {fields}",
        f"{labels['phase']}: {payload.fullPhaseName or ''}",
        f"{labels['substrate']}: {inputs.get('substrate', '')}",
        f"{labels['trend']}: {inputs.get('trend', '')}",
        f"{labels['ph']}: {inputs.get('phDrift', '')}",
        f"{labels['notes']}: {payload.userNotes or ('Keine' if is_german else 'None')}",
        f"{labels['obs']}: {observation_context}",
    ]
    if payload.ppm:
        parts.append(f"{labels['ppm']}: {payload.ppm}")

    parts.append(format_instruction)
    parts.append("Keys: potentialIssues(array[{issue,confidence,explanation}]), recommendedActions(array[string]), disclaimer(string).")
    parts.append(f"{('Sprache für Erklärungen und Empfehlungen' if is_german else 'Language for explanations and recommendations')}: {'Deutsch' if is_german else 'English'}.")

    return "\n".join(parts)


def _strict_json_instruction(json_example: str, lang_label: str) -> str:
    return (
        "Output JSON only. No markdown. No prose.\n"
        "Ensure valid, minified JSON exactly matching the schema.\n"
        f"Write explanations in {lang_label}.\n"
        f"Example:\n{json_example}"
    )


def _retry_settings() -> Dict[str, Union[int, float]]:
    def _as_float(env_key: str, default: float) -> float:
        raw = os.getenv(env_key)
        if raw is None:
            return default
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return default
        if not (value >= 0 or value <= 0):
            return default
        return value

    def _as_int(env_key: str, default: int, minimum: int = 1) -> int:
        raw = os.getenv(env_key)
        if raw is None:
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return default
        return max(minimum, value)

    return {
        "tries": _as_int("GEMINI_MAX_RETRIES", 4),
        "timeout": _as_float("GEMINI_REQUEST_TIMEOUT", 120.0),  # seconds
        "initial_delay": _as_float("GEMINI_BACKOFF_INITIAL", 1.0),
        "max_delay": _as_float("GEMINI_BACKOFF_MAX", 16.0),
        "jitter_ratio": max(0.0, _as_float("GEMINI_BACKOFF_JITTER_RATIO", 0.3)),
    }


def _is_thinking_model(model_name: str) -> bool:
    m = model_name.lower()
    return "thinking" in m or "gemini-3" in m or "gemini-2.0-flash-thinking" in m


def _generate_json_with_retry(
    user_parts: List[types.Part],
    extra_instruction: str,
    max_tokens: int,
    temperature: float,
    tries: Optional[int] = None,
    request_timeout: Optional[float] = None,  # seconds
) -> Tuple[Optional[dict], str]:
    retry = _retry_settings()
    attempt_limit = int(tries if tries is not None else retry["tries"])
    timeout_sec = request_timeout if request_timeout is not None else float(retry["timeout"])
    delay = float(retry["initial_delay"])
    max_delay = float(retry["max_delay"])
    jitter_ratio = float(retry["jitter_ratio"])
    attempt_limit = max(1, attempt_limit)
    timeout_sec = max(1.0, float(timeout_sec))
    client: Optional[genai.Client] = None
    last_text = ""

    for attempt in range(attempt_limit):
        if client is None:
            client = _client(timeout_sec)

        contents = types.Content(
            role="user",
            parts=user_parts + [types.Part.from_text(text=extra_instruction)],
        )
        model_name = _model()
        config_params: Dict[str, Any] = {
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

        # Add thinking config for supported models if budget is provided via ENV or default
        if _is_thinking_model(model_name):
            budget = int(os.getenv("GEMINI_THINKING_BUDGET", "1024"))
            # According to latest google-genai, ThinkingConfig only supports include_thoughts
            try:
                config_params["thinking_config"] = types.ThinkingConfig(
                    include_thoughts=True,
                    thinking_budget=budget
                )
            except (AttributeError, TypeError):
                # Fallback if SDK varies
                pass

        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(**config_params),
            )
        except errors.APIError as exc:
            last_text = f"APIError {exc.code}: {exc.message}"
            if exc.code in _RETRYABLE_API_CODES and attempt < attempt_limit - 1:
                jitter = random.uniform(0.0, delay * jitter_ratio)
                time.sleep(delay + jitter)
                delay = min(delay * 2.0, max_delay)
                client = None
                _reset_client()
                continue
            raise

        last_text = _resp_text(resp)
        parsed = _extract_json(last_text)
        if isinstance(parsed, dict):
            return parsed, last_text

        # Next attempt: stricter instruction
        extra_instruction = "Return only valid minified JSON matching the schema. No extra text."
    return None, last_text

# ---------- Stage normalization ----------
_ALLOWED_STAGE = {"Vegetative", "Flowering", "Ripening"}
_STAGE_SYNONYMS = {
    "bl\u00fcte": "Flowering", "bluete": "Flowering",
    "vorbl\u00fcte": "Flowering", "reife": "Ripening",
    "wachstum": "Vegetative", "vegetativ": "Vegetative",
    "bloom": "Flowering", "veg": "Vegetative",
    "ripen": "Ripening", "maturation": "Ripening",
}

_RECIPE_TARGET_TOTAL = 1000.0
# UPDATED VECTOR recipe with MAP and revised weights
_VECTOR_RECIPE_RAW = {
    "MgSO4": 240.8,
    "K2SO4": 232.4,
    "KNO3": 4.8,
    "MKP": 126.8,
    "MAP": 342.2,
    "MMX": 40.1,
    "FeEDTA": 8.0,
    "H3BO3": 4.6,
    "Na2MoO4": 0.2,
}
_PULSE_RECIPE_RAW = {
    "MgSO4": 89.980965565,
    "K2SO4": 273.807463806,
    "KNO3": 0.0,
    "MKP": 180.019611236,
    "MMX": 24.9754859549,
    "FeEDTA": 5.01816923343,
    "H3BO3": 2.88400530657,
    "Na2MoO4": 0.115360212263,
}
# UPDATED normalization for VECTOR
_VECTOR_NORMALIZATION = 1.0563
_PULSE_NORMALIZATION = 1.7337

_P_FROM_P2O5 = 0.4365
_K_FROM_K2O = 0.8301
_S_FROM_SO3 = 0.4
_MKP_P2O5 = 0.52
_MKP_K2O = 0.34
# MAP composition (monoammonium phosphate)
_MAP_N = 0.12
_MAP_P2O5 = 0.61
_KNO3_N = 0.13
_KNO3_K2O = 0.46
_SOP_K2O = 0.50
_SOP_SO3 = 0.45
_EPSOM_MG = 0.0981
_EPSOM_S = 0.1222
_MMX_MICROS = {"Fe": 0.078, "Mn": 0.026, "Zn": 0.013, "Cu": 0.005, "B": 0.007, "Mo": 0.0032}
_FEEDTA_FE = 0.13
_H3BO3_B = 0.1749
_NA2MOO4_MO = 0.396


def _normalize_recipe_weights(
    recipe: Dict[str, float],
    *,
    scale: float = 1.0,
    target_total: float = _RECIPE_TARGET_TOTAL,
) -> Dict[str, float]:
    scaled: Dict[str, float] = {}
    for salt, grams in recipe.items():
        amount = float(grams or 0.0) * float(scale)
        scaled[salt] = max(0.0, amount)

    total = sum(scaled.values())
    if total <= 0.0:
        return {salt: 0.0 for salt in recipe}

    adjust = target_total / total
    return {salt: grams * adjust for salt, grams in scaled.items()}


def _recipe_fractions(
    recipe: Dict[str, float],
    *,
    scale: float = 1.0,
    target_total: float = _RECIPE_TARGET_TOTAL,
) -> Dict[str, float]:
    normalized = _normalize_recipe_weights(recipe, scale=scale, target_total=target_total)
    divisor = target_total or 1.0
    return {salt: grams / divisor for salt, grams in normalized.items()}


def _ppm_from_recipe(recipe: Dict[str, float], *, scale: float) -> Dict[str, float]:
    fractions = _recipe_fractions(recipe, scale=scale)
    profile: Dict[str, float] = {
        "N": 0.0,
        "P": 0.0,
        "K": 0.0,
        "Ca": 0.0,
        "Mg": 0.0,
        "S": 0.0,
        "Fe": 0.0,
        "B": 0.0,
        "Mo": 0.0,
        "Mn": 0.0,
        "Zn": 0.0,
        "Cu": 0.0,
    }

    mgso4 = fractions.get("MgSO4")
    if mgso4:
        profile["Mg"] += mgso4 * _EPSOM_MG * 1000.0
        profile["S"] += mgso4 * _EPSOM_S * 1000.0

    k2so4 = fractions.get("K2SO4")
    if k2so4:
        profile["K"] += k2so4 * _SOP_K2O * _K_FROM_K2O * 1000.0
        profile["S"] += k2so4 * _SOP_SO3 * _S_FROM_SO3 * 1000.0

    kno3 = fractions.get("KNO3")
    if kno3:
        profile["N"] += kno3 * _KNO3_N * 1000.0
        profile["K"] += kno3 * _KNO3_K2O * _K_FROM_K2O * 1000.0

    mkp = fractions.get("MKP")
    if mkp:
        profile["P"] += mkp * _MKP_P2O5 * _P_FROM_P2O5 * 1000.0
        profile["K"] += mkp * _MKP_K2O * _K_FROM_K2O * 1000.0

    # MAP contribution (new)
    map_ = fractions.get("MAP")
    if map_:
        profile["N"] += map_ * _MAP_N * 1000.0
        profile["P"] += map_ * _MAP_P2O5 * _P_FROM_P2O5 * 1000.0

    mmx = fractions.get("MMX")
    if mmx:
        for nutrient, fraction in _MMX_MICROS.items():
            profile[nutrient] += mmx * fraction * 1000.0

    feedta = fractions.get("FeEDTA")
    if feedta:
        profile["Fe"] += feedta * _FEEDTA_FE * 1000.0

    h3bo3 = fractions.get("H3BO3")
    if h3bo3:
        profile["B"] += h3bo3 * _H3BO3_B * 1000.0

    na2moo4 = fractions.get("Na2MoO4")
    if na2moo4:
        profile["Mo"] += na2moo4 * _NA2MOO4_MO * 1000.0

    return {k: round(v, 6) for k, v in profile.items() if v}
_NUTRIENT_COMPOSITION = {
    "A": {"N": 137.0, "Ca": 114.0, "Mg": 38.4},
    "B": _ppm_from_recipe(_VECTOR_RECIPE_RAW, scale=_VECTOR_NORMALIZATION),
    "C": _ppm_from_recipe(_PULSE_RECIPE_RAW, scale=_PULSE_NORMALIZATION),
    "BURST": {"P": 136.19, "K": 331.21, "Mg": 2.45, "S": 73.26},
}


def _format_nutrient_table() -> str:
    lines: List[str] = []
    for component, nutrients in _NUTRIENT_COMPOSITION.items():
        pairs = ", ".join(f"{k}≈{v:.2f}" for k, v in nutrients.items())
        lines.append(f"- {component}: {pairs} ppm pro g/L")
    return "\n".join(lines)


def _norm_stage(s: str) -> Optional[str]:
    v = (s or "").strip().strip('"').lower()
    if not v:
        return None
    if v in {x.lower() for x in _ALLOWED_STAGE}:
        return v.capitalize()
    return _STAGE_SYNONYMS.get(v)

# ---------- Routes ----------
@app.get("/health")
def health_root():
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/store/{collection}/{key}")
def store_get(collection: str, key: str):
    print(f"DEBUG: Getting store for {collection}/{key}")
    data = _load_store()
    return {"data": (data.get(collection) or {}).get(key)}


def _ha_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-HASSIO-KEY": token,
        "X-Hassio-Key": token,
        "Content-Type": "application/json",
    }


@app.get("/api/ha/entities")
def ha_entities():
    token = os.getenv("SUPERVISOR_TOKEN")
    if not token:
        print("DEBUG: No SUPERVISOR_TOKEN found, using development fallback.")
        return [
            {"entity_id": "sensor.growbox_temp", "attributes": {"friendly_name": "Growbox Temperature"}},
            {"entity_id": "sensor.growbox_humidity", "attributes": {"friendly_name": "Growbox Humidity"}},
            {"entity_id": "sensor.growbox_ph", "attributes": {"friendly_name": "pH Probe"}},
            {"entity_id": "sensor.growbox_ec", "attributes": {"friendly_name": "EC Probe"}},
        ]

    import requests
    # Try both standard and alternative proxy URLs
    urls = ["http://supervisor/core/api/states", "http://supervisor/api/states"]
    last_error = ""

    for url in urls:
        print(f"DEBUG: Trying to fetch entities from {url}")
        try:
            resp = requests.get(url, headers=_ha_headers(token), timeout=15)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                print(f"DEBUG: Successfully fetched {len(data)} entities from {url}")
                return data
            else:
                print(f"DEBUG: Response from {url} is not a list: {type(data)}")
                last_error = f"Response from {url} is not a list."
        except Exception as e:
            err_msg = str(e)
            if isinstance(e, requests.exceptions.HTTPError):
                err_msg += f" (Status: {e.response.status_code})"
            print(f"DEBUG: Failed to fetch from {url}: {err_msg}")
            last_error = err_msg

    print(f"ERROR: All HA entity fetch attempts failed. Last error: {last_error}")
    return JSONResponse({"error": f"Failed to fetch HA entities. Last error: {last_error}"}, status_code=502)


@app.get("/api/ha/state/{entity_id}")
def ha_state(entity_id: str):
    token = os.getenv("SUPERVISOR_TOKEN")
    if not token:
        import random
        return {"state": str(round(random.uniform(20, 28), 1))}

    import requests
    urls = [f"http://supervisor/core/api/states/{entity_id}", f"http://supervisor/api/states/{entity_id}"]
    last_error = ""

    for url in urls:
        try:
            resp = requests.get(url, headers=_ha_headers(token), timeout=10)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            last_error = str(e)
            continue

    print(f"ERROR: Failed to fetch state for {entity_id}. Last error: {last_error}")
    return JSONResponse({"error": f"Failed to fetch state for {entity_id}: {last_error}"}, status_code=502)


@app.post("/api/store/{collection}/{key}")
def store_set(collection: str, key: str, payload: StorePayload):
    print(f"DEBUG: Setting store for {collection}/{key}")
    _ensure_store_dir()
    with _store_lock():
        data = _read_store_unlocked()
        data.setdefault(collection, {})[key] = payload.data
        _write_store_unlocked(data)
    return {"ok": True}

# --- Gemini: Image analysis ---
@app.post("/api/gemini/analyze-image")
def gemini_analyze_image(payload: AnalyzeImagePayload):
    _ = _api_key()
    if not payload.imagesBase64:
        return JSONResponse({"error": "No images provided."}, status_code=400)

    lang = (payload.lang or "en").lower()
    prompt_lang = "German" if lang.startswith("de") else "English"

    instruction = payload.prompt or _build_image_prompt(payload)

    user_parts: List[types.Part] = [types.Part.from_text(text=instruction)]
    for item in payload.imagesBase64:
        img_bytes, mime = _decode_data_uri_or_b64(item)
        user_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))

    json_example = (
        '{"potentialIssues":[{"issue":"Example","confidence":"High","explanation":"..."}],'
        '"recommendedActions":["..."],"disclaimer":"This is an AI-based visual assessment."}'
    )
    extra = _strict_json_instruction(json_example, prompt_lang)

    try:
        parsed, raw = _generate_json_with_retry(
            user_parts=user_parts,
            extra_instruction=extra,
            max_tokens=2048,
            temperature=0.2,
        )
        if isinstance(parsed, dict) and \
           isinstance(parsed.get("potentialIssues"), list) and \
           isinstance(parsed.get("recommendedActions"), list) and \
           isinstance(parsed.get("disclaimer"), str):
            return parsed

        raw_text = _strip_code_fences(raw)
        if not raw_text:
            return JSONResponse({"error": "No model output."}, status_code=502)
        return {
            "potentialIssues": [],
            "recommendedActions": [],
            "disclaimer": raw_text,
        }
    except errors.APIError as e:
        return JSONResponse({"error": f"APIError {e.code}: {e.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)

# --- Gemini: Stage analysis ---
@app.post("/api/gemini/analyze-stage")
def gemini_analyze_stage(payload: StagePayload):
    _ = _api_key()
    phase = (payload.phase or "").strip()
    days = int(payload.daysSinceStart)
    lang = (payload.lang or "en").lower()
    prompt_lang = "German" if lang.startswith("de") else "English"

    user_text = f"""
Task: Infer the plant's primary physiological stage from the inputs.

Inputs:
- Current plan phase: "{phase}"
- Days since grow started: {days}
- Typical timeline for photoperiod plants: Vegetative ≈ 1–35, Flowering ≈ 36–90, Ripening ≈ 90+.

Rules:
- Output JSON only, minified, no markdown.
- "stage" must be one of: "Vegetative" | "Flowering" | "Ripening".
- "confidence" must be: "High" | "Medium" | "Low".
- Write "reasoning" in {prompt_lang}.
- If uncertain, pick the most likely stage. Do not output other enums.
""".strip()

    user_parts = [types.Part.from_text(text=user_text)]
    schema_example = '{"stage":"Vegetative","confidence":"High","reasoning":"..."}'
    extra = _strict_json_instruction(schema_example, prompt_lang)

    try:
        parsed, raw = _generate_json_with_retry(
            user_parts=user_parts,
            extra_instruction=extra,
            max_tokens=512,
            temperature=0.2,
        )
        if isinstance(parsed, dict):
            stage_raw = str(parsed.get("stage", "")).strip()
            conf_raw = str(parsed.get("confidence", "")).strip()
            reasoning = str(parsed.get("reasoning", "")).strip()

            stage = _norm_stage(stage_raw) or ("Vegetative" if days <= 35 else "Flowering" if days <= 90 else "Ripening")
            confidence = {"high": "High", "medium": "Medium", "low": "Low"}.get(conf_raw.lower(), "Medium")

            return {
                "stage": stage,
                "confidence": confidence,
                "reasoning": reasoning or f"Inferred from days={days} and phase='{phase}'.",
            }

        stage = "Vegetative" if days <= 35 else "Flowering" if days <= 90 else "Ripening"
        return {"stage": stage, "confidence": "Low", "reasoning": _strip_code_fences(raw) or f"Heuristic fallback for days={days}."}
    except errors.APIError as e:
        return JSONResponse({"error": f"APIError {e.code}: {e.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)

# --- Gemini: Plan optimization ---
@app.post("/api/gemini/optimize-plan")
def gemini_optimize_plan(payload: PlanOptimizationPayload):
    _ = _api_key()
    if not payload.weeks:
        return JSONResponse({"error": "No weeks provided."}, status_code=400)

    lang = (payload.lang or "en").lower()
    prompt_lang = "German" if lang.startswith("de") else "English"

    stage_labels = {
        "veg": "vegetative",
        "vegetative": "vegetative",
        "flower": "flowering",
        "flowering": "flowering",
        "bloom": "flowering",
        "ripen": "ripening",
        "ripening": "ripening",
    }

    sanitized_weeks: List[Dict[str, Any]] = []
    for week in payload.weeks:
        phase = (week.phase or "").strip()
        targets: Dict[str, float] = {}
        for key, value in (week.targets or {}).items():
            try:
                num = float(value)
            except (TypeError, ValueError):
                continue
            if num < 0:
                continue
            if not (num >= 0 or num <= 0):
                continue
            targets[key.upper()] = num
        if not phase or not targets:
            continue
        stage = week.stage or ""
        sanitized_weeks.append({
            "phase": phase,
            "stage": stage_labels.get(stage.lower(), stage.lower() or "flowering"),
            "targets": targets,
        })

    if not sanitized_weeks:
        return JSONResponse({"error": "No valid nutrient targets provided."}, status_code=400)

    def _format_targets() -> str:
        lines: List[str] = []
        for idx, item in enumerate(sanitized_weeks, start=1):
            targets = ", ".join(f"{k}={v}" for k, v in item["targets"].items())
            stage = item["stage"]
            lines.append(f"Week {idx} – {item['phase']} ({stage}): {targets}")
        return "\n".join(lines)

    water_profile: Dict[str, float] = {}
    if payload.waterProfile:
        for key, value in payload.waterProfile.items():
            try:
                num = float(value)
            except (TypeError, ValueError):
                continue
            if num < 0:
                continue
            water_profile[key.upper()] = num

    osmosis_share = payload.osmosisShare if isinstance(payload.osmosisShare, (int, float)) else None
    if isinstance(osmosis_share, (int, float)):
        osmosis_share = min(1.0, max(0.0, float(osmosis_share)))
    else:
        osmosis_share = None

    water_lines: List[str] = []
    if water_profile:
        water_lines.append("Base water profile (ppm):")
        for key, value in sorted(water_profile.items()):
            water_lines.append(f"- {key}: {value}")
    if osmosis_share is not None:
        water_lines.append(f"Reverse osmosis share: {osmosis_share * 100:.1f}%")

    context_parts = [
        "You design PhotonFlux nutrient schedules (components A, B/VECTOR, C/PULSE and BURST booster).",
        "Each gram per liter roughly adds the following ppm:",
        _format_nutrient_table(),
        "Week targets (desired ppm after mixing nutrients + water contribution):",
        _format_targets(),
    ]
    if water_lines:
        context_parts.append("\n".join(water_lines))
    if payload.substrate:
        context_parts.append(f"Substrate: {payload.substrate}")
    if payload.cultivar:
        context_parts.append(f"Cultivar: {payload.cultivar}")

    is_german = lang.startswith("de")
    if is_german:
        guidance = (
            "Regeln:\n"
            "- Halte Komponente A zwischen 0 und 1.3 g/L, BURST zwischen 0 und 0.25 g/L.\n"
            "- Verwende Komponente B für vegetative Phasen und Komponente C für Blüte-/Reifephasen.\n"
            "- Gib pH- und EC-Empfehlungen als kurze Strings an (z. B. '5.8', '2.0').\n"
            "- Die Zusammenfassung sollte hervorheben, wie genau die Zielwerte erreicht werden, und Kompromisse benennen.\n"
            "- Die erreichten PPM müssen den Wasserbeitrag berücksichtigen (Osmose-Anteil reduziert das Basisprofil).\n"
            "- 'diff' ist 'erreicht' minus 'Ziel' (positiv bedeutet über dem Ziel).\n"
            "- Antworte auf DEUTSCH."
        )
    else:
        guidance = (
            "Rules:\n"
            "- Keep A between 0 and 1.3 g/L, BURST between 0 and 0.25 g/L.\n"
            "- Use component B for vegetative stages and component C for flowering/ripening stages.\n"
            "- Provide pH and EC suggestions as short strings (e.g. '5.8', '2.0').\n"
            "- Summaries should highlight how closely the targets are matched and mention any trade-offs.\n"
            "- Achieved ppm should include the water contribution (osmosis share reduces the base profile).\n"
            "- diff should be achieved minus target (positive means over target).\n"
            "- Respond in ENGLISH."
        )

    user_text = "\n\n".join(context_parts + [guidance])

    schema_example = (
        '{"plan":[{'
        '"phase":"W1","stage":"flowering","A":0.85,"X":0.9,"BZ":0.15,'
        '"pH":"5.8","EC":"1.9","achieved":{"N":180,"P":60},'
        '"diff":{"N":-5,"P":2},"notes":"Keep Ca in check"}],'
        '"summary":"Overall deviation within ±5 ppm."}'
    )
    extra = _strict_json_instruction(schema_example, prompt_lang)

    try:
        user_parts = [types.Part.from_text(text=user_text)]
        parsed, raw = _generate_json_with_retry(
            user_parts=user_parts,
            extra_instruction=extra,
            max_tokens=2048,
            temperature=0.2,
        )

        def _as_float(value: Any) -> Optional[float]:
            try:
                f = float(value)
            except (TypeError, ValueError):
                return None
            if not (f >= 0 or f <= 0):
                return None
            return f

        def _sanitize_nutrient_dict(data: Any) -> Dict[str, float]:
            result: Dict[str, float] = {}
            if isinstance(data, dict):
                for key, value in data.items():
                    v = _as_float(value)
                    if v is not None:
                        result[str(key).upper()] = v
            return result

        plan_items: List[Dict[str, Any]] = []
        summary_text = ""
        if isinstance(parsed, dict):
            summary = parsed.get("summary")
            if isinstance(summary, str):
                summary_text = summary.strip()
            items = parsed.get("plan")
            if isinstance(items, list):
                for raw_item in items:
                    if not isinstance(raw_item, dict):
                        continue
                    phase = str(raw_item.get("phase") or "").strip()
                    if not phase:
                        continue
                    plan_items.append({
                        "phase": phase,
                        "stage": str(raw_item.get("stage") or "").strip(),
                        "A": (lambda v: v if v is not None and v >= 0 else 0.0)(_as_float(raw_item.get("A"))),
                        "X": (lambda v: v if v is not None and v >= 0 else 0.0)(_as_float(raw_item.get("X"))),
                        "BZ": (lambda v: v if v is not None and v >= 0 else 0.0)(_as_float(raw_item.get("BZ"))),
                        "pH": str(raw_item.get("pH") or "").strip(),
                        "EC": str(raw_item.get("EC") or "").strip(),
                        "achieved": _sanitize_nutrient_dict(raw_item.get("achieved")),
                        "diff": _sanitize_nutrient_dict(raw_item.get("diff")),
                        "notes": str(raw_item.get("notes") or "").strip(),
                    })

        if plan_items:
            return {"plan": plan_items, "summary": summary_text}

        fallback = _strip_code_fences(raw)
        if not fallback:
            return JSONResponse({"error": "No model output."}, status_code=502)
        return {"plan": [], "summary": fallback}
    except errors.APIError as e:
        return JSONResponse({"error": f"APIError {e.code}: {e.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)

# --- Text analysis (optional) ---
@app.post("/api/gemini/analyze-text")
def gemini_analyze_text(payload: AnalyzeTextPayload):
    _ = _api_key()
    text = (payload.text or "").strip()
    if not text:
        return JSONResponse({"error": "Text is empty."}, status_code=400)
    prompt = (
        "Analysiere den N\u00e4hrstoff- und Pflegezustand der Pflanze basierend auf dem Text. "
        "Gib NUR g\u00fcltiges, minimiertes JSON ohne Markdown-Fences aus: "
        '{"befund": "string", "ursachen": ["string"], "massnahmen": ["string"]}.'
    )
    try:
        contents = types.Content(role="user", parts=[types.Part.from_text(text=prompt + "\n\n" + text)])
        resp = _client().models.generate_content(
            model=_model(),
            contents=contents,
            config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=1024),
        )
        out = _resp_text(resp)
        return {"result": out}
    except errors.APIError as e:
        return JSONResponse({"error": f"APIError {e.code}: {e.message}"}, status_code=502)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)

# --- Legacy ---
@app.post("/api/ai/analyze")
def legacy_ai_analyze(payload: AnalyzeTextPayload):
    return gemini_analyze_text(payload)


@app.post("/api/analyze")
def legacy_analyze(payload: AnalyzeTextPayload):
    return gemini_analyze_text(payload)

# --- Static mount ---
if os.path.isdir(PUBLIC_DIR):
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="static")
