import type {
  Language,
  Cultivar,
  Substrate,
  NutrientProfile,
  PlanOptimizerWeekInput,
  PlanOptimizationResponse,
  PlanOptimizationSuggestion,
  NutrientTargets,
} from '../types';
import type { ServiceResult, ServiceError } from './aiService';

export interface PlanOptimizerRequest {
  lang: Language;
  cultivar?: Cultivar;
  substrate: Substrate;
  waterProfile: NutrientProfile;
  osmosisShare: number;
  weeks: PlanOptimizerWeekInput[];
}

const createError = (
  code: string,
  message: string,
  details?: string,
  status?: number
): ServiceError => ({
  code,
  message,
  ...(details ? { details } : {}),
  ...(typeof status === 'number' ? { status } : {}),
});

const formatDetails = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
};

const extractErrorMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const asRecord = payload as Record<string, unknown>;

  const errorField = asRecord.error;
  if (typeof errorField === 'string') {
    return errorField;
  }
  if (errorField && typeof errorField === 'object') {
    const nested = errorField as Record<string, unknown>;
    if (typeof nested.message === 'string') {
      return nested.message;
    }
    if (typeof nested.detail === 'string') {
      return nested.detail;
    }
  }

  const detailField = asRecord.detail;
  if (typeof detailField === 'string') {
    return detailField;
  }
  if (Array.isArray(detailField)) {
    const details = detailField
      .map(item => {
        if (!item || typeof item !== 'object') {
          return typeof item === 'string' ? item : null;
        }
        const entry = item as Record<string, unknown>;
        if (typeof entry.msg === 'string') {
          return entry.msg;
        }
        if (typeof entry.message === 'string') {
          return entry.message;
        }
        return null;
      })
      .filter((msg): msg is string => Boolean(msg));
    if (details.length) {
      return details.join(' ');
    }
  }

  if (typeof asRecord.message === 'string') {
    return asRecord.message;
  }

  return undefined;
};

const sanitizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return null;
};

const sanitizeTargets = (input: unknown): NutrientTargets | undefined => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const result: NutrientTargets = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = sanitizeNumber(raw);
    if (value === null) continue;
    result[key.toUpperCase() as keyof NutrientTargets] = value;
  }
  return Object.keys(result).length ? result : undefined;
};

const sanitizeSuggestion = (entry: unknown): PlanOptimizationSuggestion | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const phaseRaw = (entry as { phase?: unknown }).phase;
  const phase = typeof phaseRaw === 'string' ? phaseRaw.trim() : '';
  if (!phase) {
    return null;
  }

  const aValue = sanitizeNumber((entry as any).A);
  const xValue = sanitizeNumber((entry as any).X);
  const bzValue = sanitizeNumber((entry as any).BZ);

  const suggestion: PlanOptimizationSuggestion = {
    phase,
    stage: typeof (entry as any).stage === 'string' ? ((entry as any).stage as string).trim() || undefined : undefined,
    A: aValue !== null && aValue >= 0 ? aValue : 0,
    X: xValue !== null && xValue >= 0 ? xValue : 0,
    BZ: bzValue !== null && bzValue >= 0 ? bzValue : 0,
    pH: typeof (entry as any).pH === 'string' ? ((entry as any).pH as string).trim() || undefined : undefined,
    EC: typeof (entry as any).EC === 'string' ? ((entry as any).EC as string).trim() || undefined : undefined,
    notes: typeof (entry as any).notes === 'string' ? ((entry as any).notes as string).trim() || undefined : undefined,
  };

  const achieved = sanitizeTargets((entry as any).achieved);
  if (achieved) suggestion.achieved = achieved;

  const diff = sanitizeTargets((entry as any).diff);
  if (diff) suggestion.diff = diff;

  return suggestion;
};

export const optimizePlan = async (
  request: PlanOptimizerRequest
): Promise<ServiceResult<PlanOptimizationResponse>> => {
  const fallbackMessage =
    request.lang === 'de'
      ? 'Der Optimierer konnte keinen Düngeplan erzeugen.'
      : 'The optimizer could not generate a nutrient plan.';

  try {
    let response: Response;
    try {
      response = await fetch('api/gemini/optimize-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        request.lang === 'de'
          ? 'Die Optimierung konnte nicht gestartet werden. Bitte Verbindung prüfen.'
          : 'The optimization could not be started. Please check your connection.';
      return { ok: false, error: createError('NETWORK_ERROR', message, details) };
    }

    if (!response.ok) {
      let message: string | undefined;
      let details: string | undefined;

      try {
        const text = await response.text();
        if (text) {
          details = text;
          try {
            const parsed = JSON.parse(text);
            const extracted = extractErrorMessage(parsed);
            if (extracted) {
              message = extracted;
            }
            if (!details) {
              details = JSON.stringify(parsed);
            }
          } catch {
            if (!message && text.trim()) {
              message = text.trim();
            }
          }
        }
      } catch {
        details = undefined;
      }

      if (!message) {
        message =
          request.lang === 'de'
            ? `Serverfehler (${response.status}). Bitte später erneut versuchen.`
            : `Server error (${response.status}). Please try again later.`;
      }

      return {
        ok: false,
        error: createError('PROXY_ERROR', message, details, response.status),
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        request.lang === 'de'
          ? 'Die Antwort des Optimierers konnte nicht gelesen werden.'
          : 'Failed to read the optimizer response.';
      return { ok: false, error: createError('INVALID_JSON', message, details) };
    }

    if (data && typeof data === 'object' && 'error' in data) {
      const raw = (data as { error: unknown }).error;
      const message =
        typeof raw === 'string'
          ? raw
          : request.lang === 'de'
          ? 'Der Optimierer hat einen Fehler gemeldet.'
          : 'The optimizer reported an error.';
      return { ok: false, error: createError('BACKEND_ERROR', message, formatDetails(raw)) };
    }

    const plan: PlanOptimizationSuggestion[] = [];
    let summary: string | undefined;

    if (data && typeof data === 'object') {
      const summaryRaw = (data as { summary?: unknown }).summary;
      if (typeof summaryRaw === 'string' && summaryRaw.trim()) {
        summary = summaryRaw.trim();
      }

      const planRaw = (data as { plan?: unknown }).plan;
      if (Array.isArray(planRaw)) {
        for (const entry of planRaw) {
          const suggestion = sanitizeSuggestion(entry);
          if (suggestion) {
            plan.push(suggestion);
          }
        }
      }
    } else if (typeof data === 'string' && data.trim()) {
      summary = data.trim();
    }

    if (!plan.length) {
      const message = summary || fallbackMessage;
      return {
        ok: false,
        error: createError('PLAN_EMPTY', message, formatDetails(data)),
      };
    }

    return { ok: true, data: { plan, summary } };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError('UNEXPECTED_ERROR', fallbackMessage, details) };
  }
};
