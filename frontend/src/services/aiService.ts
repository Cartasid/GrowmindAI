import type {
  AiAnalysisResponse,
  JournalEntry,
  Language,
  Phase,
  Plan,
  PlanOptimizationResponse,
  StageAnalysisResult,
} from "../types";
import { apiUrl } from "../api";

export interface AnalyzerInputs {
  trend?: string;
  tipburn?: string;
  pale?: string;
  caMgDeficiency?: string;
  claw?: string;
  phDrift?: string;
  substrate?: string;
}

export interface NutrientProfile {
  [key: string]: number;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
  status?: number;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

// Maximum total file size: 10MB
const MAX_TOTAL_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!result || !result.includes(',')) {
        reject(new Error("Invalid file data"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Failed to extract base64 data"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const createError = (
  code: string,
  message: string,
  details?: string,
  status?: number
): ServiceError => ({
  code,
  message,
  ...(details ? { details } : {}),
  ...(typeof status === "number" ? { status } : {}),
});

const formatDetails = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
};

export const analyzePlantImage = async (
  imageFiles: File[],
  inputs: AnalyzerInputs,
  fullPhaseName: string,
  userNotes: string | undefined,
  lang: Language,
  ppm?: NutrientProfile,
  journalHistory?: JournalEntry[]
): Promise<ServiceResult<AiAnalysisResponse>> => {
  const fallbackMessage =
    lang === "de" ? "Die Analyse konnte nicht abgeschlossen werden." : "Unable to complete the analysis.";

  try {
    // Validate total file size before processing
    const totalSize = imageFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_IMAGE_SIZE_BYTES) {
      const message =
        lang === "de"
          ? `Die Gesamtgröße der Bilder (${(totalSize / 1024 / 1024).toFixed(1)}MB) überschreitet das Maximum von ${MAX_TOTAL_IMAGE_SIZE_BYTES / 1024 / 1024}MB.`
          : `Total image size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the maximum of ${MAX_TOTAL_IMAGE_SIZE_BYTES / 1024 / 1024}MB.`;
      return { ok: false, error: createError("IMAGE_TOO_LARGE", message) };
    }

    let imagesBase64: string[];
    try {
      imagesBase64 = await Promise.all(imageFiles.map(fileToBase64));
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === "de"
          ? "Die ausgewählten Fotos konnten nicht verarbeitet werden."
          : "The selected photos could not be processed.";
      return { ok: false, error: createError("IMAGE_ENCODING_FAILED", message, details) };
    }

    if (!imagesBase64.length) {
      const message = lang === "de" ? "Bitte wähle mindestens ein Foto aus." : "Please select at least one photo.";
      return { ok: false, error: createError("NO_IMAGES_SELECTED", message) };
    }

    let response: Response;
    const normalizedNotes = typeof userNotes === "string" ? userNotes.trim() : "";

    try {
      response = await fetch(apiUrl("/api/gemini/analyze-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagesBase64,
          inputs,
          fullPhaseName,
          userNotes: normalizedNotes || undefined,
          lang,
          ppm,
          journalHistory,
        }),
      });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === "de"
          ? "Die Analyse konnte nicht gestartet werden. Bitte überprüfe deine Verbindung."
          : "The analysis could not be started. Please check your connection.";
      return { ok: false, error: createError("NETWORK_ERROR", message, details) };
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        details = await response.text();
      } catch {
        details = undefined;
      }
      const message =
        lang === "de"
          ? `Serverfehler (${response.status}). Bitte versuche es erneut.`
          : `Server error (${response.status}). Please try again.`;
      return {
        ok: false,
        error: createError("PROXY_ERROR", message, details, response.status),
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === "de"
          ? "Die Antwort des Servers konnte nicht gelesen werden."
          : "Failed to read the server response.";
      return { ok: false, error: createError("INVALID_JSON", message, details) };
    }

    if (data && typeof data === "object" && "error" in data) {
      const raw = (data as { error: unknown }).error;
      const message =
        typeof raw === "string"
          ? raw
          : lang === "de"
          ? "Die Analyse wurde vom Server abgelehnt."
          : "The server reported an error while processing the analysis.";
      return {
        ok: false,
        error: createError("BACKEND_ERROR", message, formatDetails(raw)),
      };
    }

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // ignore and use fallback
      }
    }

    const result: AiAnalysisResponse = {
      potentialIssues: Array.isArray((data as any)?.potentialIssues) ? (data as any).potentialIssues : [],
      recommendedActions: Array.isArray((data as any)?.recommendedActions) ? (data as any).recommendedActions : [],
      disclaimer:
        typeof (data as any)?.disclaimer === "string"
          ? (data as any).disclaimer
          : typeof data === "string"
          ? data
          : "",
    };

    if (!result.potentialIssues.length && !result.recommendedActions.length && !result.disclaimer) {
      const message =
        lang === "de" ? "Die Analyse lieferte ein unerwartetes Ergebnis." : "The analysis returned an unexpected result.";
      return {
        ok: false,
        error: createError("INVALID_RESPONSE", message, formatDetails(data)),
      };
    }

    return { ok: true, data: result };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError("UNEXPECTED_ERROR", fallbackMessage, details) };
  }
};

export const analyzeGrowthStage = async (
  phase: Phase,
  daysSinceStart: number,
  lang: Language
): Promise<ServiceResult<StageAnalysisResult>> => {
  const fallbackMessage =
    lang === "de"
      ? "Die Wachstumsphase konnte nicht ermittelt werden."
      : "Unable to analyze the growth stage.";

  try {
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/gemini/analyze-stage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, daysSinceStart, lang }),
      });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === "de"
          ? "Die Stadienanalyse konnte nicht gestartet werden. Bitte überprüfe deine Verbindung."
          : "The stage analysis could not be started. Please check your connection.";
      return { ok: false, error: createError("NETWORK_ERROR", message, details) };
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        details = await response.text();
      } catch {
        details = undefined;
      }
      const message =
        lang === "de"
          ? `Serverfehler (${response.status}) bei der Stadienanalyse.`
          : `Server error (${response.status}) while analyzing the stage.`;
      return {
        ok: false,
        error: createError("PROXY_ERROR", message, details, response.status),
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === "de"
          ? "Die Antwort der Stadienanalyse konnte nicht gelesen werden."
          : "Failed to read the stage analysis response.";
      return { ok: false, error: createError("INVALID_JSON", message, details) };
    }

    if (data && typeof data === "object" && "error" in data) {
      const raw = (data as { error: unknown }).error;
      const message =
        typeof raw === "string"
          ? raw
          : lang === "de"
          ? "Die Stadienanalyse wurde vom Server abgelehnt."
          : "The stage analysis was rejected by the server.";
      return {
        ok: false,
        error: createError("BACKEND_ERROR", message, formatDetails(raw)),
      };
    }

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // ignore
      }
    }

    if (
      typeof (data as any)?.stage !== "string" ||
      typeof (data as any)?.confidence !== "string" ||
      typeof (data as any)?.reasoning !== "string"
    ) {
      const message =
        lang === "de"
          ? "Die Stadienanalyse lieferte ein unerwartetes Format."
          : "The stage analysis returned an unexpected format.";
      return {
        ok: false,
        error: createError("INVALID_RESPONSE", message, formatDetails(data)),
      };
    }

    return { ok: true, data: data as StageAnalysisResult };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError("UNEXPECTED_ERROR", fallbackMessage, details) };
  }
};

export const optimizePlan = async (
  plan: Plan,
  lang: Language,
  cultivar?: string,
  substrate?: string,
  waterProfile?: Record<string, number>,
  osmosisShare?: number
): Promise<ServiceResult<PlanOptimizationResponse>> => {
  try {
    const response = await fetch(apiUrl("/api/gemini/optimize-plan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weeks: plan.map((entry) => ({
          phase: entry.phase,
          stage: entry.notes?.[0] ?? "",
          targets: entry.notes?.reduce?.((acc: Record<string, number>, note: string) => {
            const [key, value] = note.split(":");
            const num = Number(value);
            if (key && Number.isFinite(num)) {
              acc[key.trim().toUpperCase()] = num;
            }
            return acc;
          }, {}) ?? {},
        })),
        lang,
        cultivar,
        substrate,
        waterProfile,
        osmosisShare,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        ok: false,
        error: createError("PROXY_ERROR", "Plan optimization failed", details, response.status),
      };
    }

    const data = await response.json();
    if (!data || typeof data !== "object" || !Array.isArray((data as any).plan)) {
      return {
        ok: false,
        error: createError("INVALID_RESPONSE", "Unexpected optimization payload", formatDetails(data)),
      };
    }

    return { ok: true, data: data as PlanOptimizationResponse };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError("UNEXPECTED_ERROR", "Optimization failed", message) };
  }
};

export type PlanOptimizerWeekInput = {
  phase: string;
  stage: string;
  targets: Record<string, number>;
};

export const optimizePlanWithTargets = async (
  weeks: PlanOptimizerWeekInput[],
  lang: Language,
  cultivar?: string,
  substrate?: string,
  waterProfile?: Record<string, number>,
  osmosisShare?: number
): Promise<ServiceResult<PlanOptimizationResponse>> => {
  try {
    const response = await fetch(apiUrl("/api/gemini/optimize-plan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weeks,
        lang,
        cultivar,
        substrate,
        waterProfile,
        osmosisShare,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        ok: false,
        error: createError("PROXY_ERROR", "Plan optimization failed", details, response.status),
      };
    }

    const data = await response.json();
    if (!data || typeof data !== "object" || !Array.isArray((data as any).plan)) {
      return {
        ok: false,
        error: createError("INVALID_RESPONSE", "Unexpected optimization payload", formatDetails(data)),
      };
    }

    return { ok: true, data: data as PlanOptimizationResponse };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError("UNEXPECTED_ERROR", "Optimization failed", message) };
  }
};

export const analyzeText = async (text: string): Promise<ServiceResult<{ result: string }>> => {
  try {
    const response = await fetch(apiUrl("/api/gemini/analyze-text"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        ok: false,
        error: createError("PROXY_ERROR", "Text analysis failed", details, response.status),
      };
    }

    const data = await response.json();
    if (typeof data?.result !== "string") {
      return {
        ok: false,
        error: createError("INVALID_RESPONSE", "Unexpected text-analysis payload", formatDetails(data)),
      };
    }

    return { ok: true, data: { result: data.result } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError("UNEXPECTED_ERROR", "Text analysis failed", message) };
  }
};
