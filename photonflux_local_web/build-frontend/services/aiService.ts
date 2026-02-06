// Local-proxy version of AI service. Moves Gemini calls to the local backend.
// Two calls preserved:
//   analyzePlantImage(imageFiles, inputs, fullPhaseName, userNotes, lang, ppm?)
//   analyzeGrowthStage(phase, daysSinceStart, lang)

import type { DoserInput } from './doserService';
import type { Language, Phase, StageAnalysisResult, NutrientProfile, JournalEntry } from '../types';

export interface AnalysisIssue {
  issue: string;
  confidence: 'High' | 'Medium' | 'Low';
  explanation: string;
}

export interface AnalysisResult {
  potentialIssues: AnalysisIssue[];
  recommendedActions: string[];
  disclaimer: string;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
  status?: number;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

// Read file as Data URL, return Base64 payload after comma.
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(((reader.result as string) || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
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

export const analyzePlantImage = async (
  imageFiles: File[],
  inputs: DoserInput,
  fullPhaseName: string,
  userNotes: string | undefined,
  lang: Language,
  ppm?: Required<NutrientProfile>,
  journalHistory?: JournalEntry[]
): Promise<ServiceResult<AnalysisResult>> => {
  const fallbackMessage =
    lang === 'de'
      ? 'Die Analyse konnte nicht abgeschlossen werden.'
      : 'Unable to complete the analysis.';

  try {
    let imagesBase64: string[];
    try {
      imagesBase64 = await Promise.all(imageFiles.map(fileToBase64));
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === 'de'
          ? 'Die ausgewählten Fotos konnten nicht verarbeitet werden.'
          : 'The selected photos could not be processed.';
      return { ok: false, error: createError('IMAGE_ENCODING_FAILED', message, details) };
    }

    if (!imagesBase64.length) {
      const message =
        lang === 'de' ? 'Bitte wähle mindestens ein Foto aus.' : 'Please select at least one photo.';
      return { ok: false, error: createError('NO_IMAGES_SELECTED', message) };
    }

    let response: Response;
    const normalizedNotes = typeof userNotes === 'string' ? userNotes.trim() : '';

    try {
      response = await fetch('api/gemini/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        lang === 'de'
          ? 'Die Analyse konnte nicht gestartet werden. Bitte überprüfe deine Verbindung.'
          : 'The analysis could not be started. Please check your connection.';
      return { ok: false, error: createError('NETWORK_ERROR', message, details) };
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        details = await response.text();
      } catch {
        details = undefined;
      }
      const message =
        lang === 'de'
          ? `Serverfehler (${response.status}). Bitte versuche es erneut.`
          : `Server error (${response.status}). Please try again.`;
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
        lang === 'de'
          ? 'Die Antwort des Servers konnte nicht gelesen werden.'
          : 'Failed to read the server response.';
      return { ok: false, error: createError('INVALID_JSON', message, details) };
    }

    if (data && typeof data === 'object' && 'error' in data) {
      const raw = (data as { error: unknown }).error;
      const message =
        typeof raw === 'string'
          ? raw
          : lang === 'de'
          ? 'Die Analyse wurde vom Server abgelehnt.'
          : 'The server reported an error while processing the analysis.';
      return {
        ok: false,
        error: createError('BACKEND_ERROR', message, formatDetails(raw)),
      };
    }

    if (data && typeof data === 'object' && 'parsed' in data && (data as any).parsed) {
      data = (data as any).parsed;
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // leave as string; will be handled below
      }
    }

    const result: AnalysisResult = {
      potentialIssues: Array.isArray((data as any)?.potentialIssues)
        ? (data as any).potentialIssues
        : [],
      recommendedActions: Array.isArray((data as any)?.recommendedActions)
        ? (data as any).recommendedActions
        : [],
      disclaimer:
        typeof (data as any)?.disclaimer === 'string'
          ? (data as any).disclaimer
          : typeof data === 'string'
          ? data
          : '',
    };

    if (!result.potentialIssues.length && !result.recommendedActions.length && !result.disclaimer) {
      const message =
        lang === 'de'
          ? 'Die Analyse lieferte ein unerwartetes Ergebnis.'
          : 'The analysis returned an unexpected result.';
      return {
        ok: false,
        error: createError('INVALID_RESPONSE', message, formatDetails(data)),
      };
    }

    return { ok: true, data: result };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError('UNEXPECTED_ERROR', fallbackMessage, details) };
  }
};

export const analyzeGrowthStage = async (
  phase: Phase,
  daysSinceStart: number,
  lang: Language
): Promise<ServiceResult<StageAnalysisResult>> => {
  const fallbackMessage =
    lang === 'de'
      ? 'Die Wachstumsphase konnte nicht ermittelt werden.'
      : 'Unable to analyze the growth stage.';

  try {
    let response: Response;
    try {
      response = await fetch('api/gemini/analyze-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, daysSinceStart, lang }),
      });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === 'de'
          ? 'Die Stadienanalyse konnte nicht gestartet werden. Bitte überprüfe deine Verbindung.'
          : 'The stage analysis could not be started. Please check your connection.';
      return { ok: false, error: createError('NETWORK_ERROR', message, details) };
    }

    if (!response.ok) {
      let details: string | undefined;
      try {
        details = await response.text();
      } catch {
        details = undefined;
      }
      const message =
        lang === 'de'
          ? `Serverfehler (${response.status}) bei der Stadienanalyse.`
          : `Server error (${response.status}) while analyzing the stage.`;
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
        lang === 'de'
          ? 'Die Antwort der Stadienanalyse konnte nicht gelesen werden.'
          : 'Failed to read the stage analysis response.';
      return { ok: false, error: createError('INVALID_JSON', message, details) };
    }

    if (data && typeof data === 'object' && 'error' in data) {
      const raw = (data as { error: unknown }).error;
      const message =
        typeof raw === 'string'
          ? raw
          : lang === 'de'
          ? 'Die Stadienanalyse wurde vom Server abgelehnt.'
          : 'The stage analysis was rejected by the server.';
      return {
        ok: false,
        error: createError('BACKEND_ERROR', message, formatDetails(raw)),
      };
    }

    if (data && typeof data === 'object' && 'parsed' in data && (data as any).parsed) {
      data = (data as any).parsed;
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // leave as string for error handling below
      }
    }

    if (
      typeof (data as any)?.stage !== 'string' ||
      typeof (data as any)?.confidence !== 'string' ||
      typeof (data as any)?.reasoning !== 'string'
    ) {
      const message =
        lang === 'de'
          ? 'Die Stadienanalyse lieferte ein unerwartetes Format.'
          : 'The stage analysis returned an unexpected format.';
      return {
        ok: false,
        error: createError('INVALID_RESPONSE', message, formatDetails(data)),
      };
    }

    return { ok: true, data: data as StageAnalysisResult };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, error: createError('UNEXPECTED_ERROR', fallbackMessage, details) };
  }
};