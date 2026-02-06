import type { AiAnalysisResponse, JournalEntry, JournalEntryType, JournalPriority, Phase } from "../types";
import { apiUrl } from "../api";

type Subscriber = () => void;

type MetricsKey = keyof JournalEntry["metrics"];

type FeedingField = keyof NonNullable<JournalEntry["feedingDetails"]>;
type AdjustmentField = keyof NonNullable<JournalEntry["adjustments"]>;
type HarvestField = keyof NonNullable<JournalEntry["harvestDetails"]>;

type Cache = Record<string, JournalEntry[]>;

const API_BASE = apiUrl("/api/journal");
const ENTRY_TYPES: JournalEntryType[] = ["Observation", "Feeding", "Pest", "Training", "Harvest"];
const PRIORITIES: JournalPriority[] = ["High", "Medium", "Low"];
const PHASES: Phase[] = ["Seedling", "Vegetative", "Pre-flowering", "Flowering", "Post-flowering", "Harvesting", "Curing"];
const METRIC_KEYS: MetricsKey[] = [
  "plantHeight",
  "temp",
  "humidity",
  "ec",
  "ph",
  "ppfd",
  "co2",
  "rootTemp",
  "leafTemp",
  "vpd",
  "vwc",
  "soilEc"
];
const FEEDING_FIELDS: FeedingField[] = ["A", "X", "BZ", "EC", "pH"];
const ADJUSTMENT_FIELDS: AdjustmentField[] = ["trend", "tipburn", "pale", "caMgDeficiency", "claw", "phDrift"];
const HARVEST_FIELDS: HarvestField[] = ["wetWeight", "dryWeight", "trimWeight", "qualityRating", "densityRating", "terpenProfile", "resinProduction", "dryingNotes"];

const cache: Cache = {};
const subscribers = new Map<string, Set<Subscriber>>();
const syncPromises = new Map<string, Promise<void>>();

const randomId = () => crypto?.randomUUID?.() ?? `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toStringSafe = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
};

const normalizeMetrics = (raw: Record<string, unknown>): JournalEntry["metrics"] => {
  const metrics: JournalEntry["metrics"] = {};
  METRIC_KEYS.forEach((key) => {
    const value = toNumber(raw?.[key]);
    if (typeof value === "number") {
      metrics[key] = value;
    }
  });
  return metrics;
};

const normalizeFeeding = (raw: Record<string, unknown>): JournalEntry["feedingDetails"] | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const feeding: Partial<JournalEntry["feedingDetails"]> = {};
  FEEDING_FIELDS.forEach((key) => {
    if (key === "EC" || key === "pH") {
      const value = toStringSafe(raw[key]);
      if (value !== undefined) feeding[key] = value;
    } else {
      const value = toNumber(raw[key]);
      if (typeof value === "number") feeding[key] = value;
    }
  });
  const isComplete = FEEDING_FIELDS.every((key) => feeding[key] !== undefined);
  return isComplete ? (feeding as JournalEntry["feedingDetails"]) : undefined;
};

const normalizeAdjustments = (raw: any): JournalEntry["adjustments"] | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const adjustments: Record<string, string> = {};
  ADJUSTMENT_FIELDS.forEach((key) => {
    const value = toStringSafe(raw[key]);
    if (value) adjustments[key] = value;
  });
  return Object.keys(adjustments).length ? (adjustments as JournalEntry["adjustments"]) : undefined;
};

const normalizeHarvest = (raw: any): JournalEntry["harvestDetails"] | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const harvest: Record<string, string | number> = {};
  HARVEST_FIELDS.forEach((key) => {
    if (key === "terpenProfile" || key === "resinProduction" || key === "dryingNotes") {
      const value = toStringSafe(raw[key]);
      if (value) harvest[key] = value;
    } else {
      const value = toNumber(raw[key]);
      if (typeof value === "number") harvest[key] = value;
    }
  });
  return Object.keys(harvest).length ? (harvest as JournalEntry["harvestDetails"]) : undefined;
};

const normalizeAiResult = (raw: any): AiAnalysisResponse | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const potentialIssues = Array.isArray(raw.potentialIssues) ? raw.potentialIssues : undefined;
  const recommendedActions = Array.isArray(raw.recommendedActions) ? raw.recommendedActions : undefined;
  const disclaimer = typeof raw.disclaimer === "string" ? raw.disclaimer : undefined;
  if (!potentialIssues || !recommendedActions || disclaimer === undefined) return undefined;
  return {
    potentialIssues,
    recommendedActions,
    disclaimer,
  } as AiAnalysisResponse;
};

export const normalizeEntry = (raw: any): JournalEntry => {
  const id = toStringSafe(raw?.id) ?? randomId();
  const date = (() => {
    const input = toStringSafe(raw?.date);
    if (!input) return new Date().toISOString();
    const timestamp = Date.parse(input);
    return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
  })();

  const entryType = (() => {
    const type = toStringSafe(raw?.entryType);
    return (ENTRY_TYPES.includes(type as JournalEntryType) ? type : "Observation") as JournalEntryType;
  })();

  const priority = (() => {
    const value = toStringSafe(raw?.priority);
    return (PRIORITIES.includes(value as JournalPriority) ? value : "Medium") as JournalPriority;
  })();

  const phase = (() => {
    const value = toStringSafe(raw?.phase);
    return (PHASES.includes(value as Phase) ? value : "Vegetative") as Phase;
  })();

  const notes = typeof raw?.notes === "string" ? raw.notes : "";
  const images = Array.isArray(raw?.images) ? raw.images.filter((item: unknown): item is string => typeof item === "string") : [];
  const tags = Array.isArray(raw?.tags) ? raw.tags.filter((item: unknown): item is string => typeof item === "string") : [];

  const metricsSource = raw?.metrics && typeof raw.metrics === "object" ? raw.metrics : raw;

  return {
    id,
    growId: toStringSafe(raw?.growId),
    date,
    phase,
    entryType,
    priority,
    notes,
    images,
    tags,
    metrics: normalizeMetrics(metricsSource),
    feedingDetails: normalizeFeeding(raw?.feedingDetails),
    adjustments: normalizeAdjustments(raw?.adjustments),
    aiAnalysisResult: normalizeAiResult(raw?.aiAnalysisResult),
    harvestDetails: normalizeHarvest(raw?.harvestDetails),
    relatedEntryId: toStringSafe(raw?.relatedEntryId)
  };
};

const sortEntries = (entries: JournalEntry[]): JournalEntry[] =>
  [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const setCache = (growId: string, entries: JournalEntry[]): void => {
  cache[growId] = sortEntries(entries);
  notify(growId);
};

const notify = (growId: string) => {
  const listeners = subscribers.get(growId);
  if (!listeners) return;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("Journal subscriber failed", error);
    }
  });
};

const persist = async (growId: string, entries: JournalEntry[]): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(growId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Persist failed (${response.status}): ${detail}`);
    }
  } catch (error) {
    console.error("Failed to persist journal entries", error);
    throw error;
  }
};

const sync = async (growId: string): Promise<void> => {
  if (syncPromises.has(growId)) return syncPromises.get(growId)!;
  const promise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(growId)}`);
      if (!response.ok) {
        throw new Error(`Journal fetch failed with status ${response.status}`);
      }
      const payload = await response.json();
      const normalized: JournalEntry[] = Array.isArray(payload?.entries)
        ? payload.entries.map(normalizeEntry)
        : [];
      setCache(growId, normalized);
    } catch (error) {
      console.error("Failed to load journal entries", error);
    } finally {
      syncPromises.delete(growId);
    }
  })();
  syncPromises.set(growId, promise);
  return promise;
};

export const loadJournal = (growId: string): JournalEntry[] => {
  if (!cache[growId]) {
    cache[growId] = [];
    void sync(growId);
  }
  return [...cache[growId]];
};

export const saveJournal = async (growId: string, entries: JournalEntry[]): Promise<void> => {
  const sorted = sortEntries(entries);
  setCache(growId, sorted);
  await persist(growId, sorted);
};

export const subscribe = (growId: string, listener: Subscriber): (() => void) => {
  const listeners = subscribers.get(growId) ?? new Set<Subscriber>();
  listeners.add(listener);
  subscribers.set(growId, listeners);
  return () => {
    const bucket = subscribers.get(growId);
    if (!bucket) return;
    bucket.delete(listener);
    if (bucket.size === 0) {
      subscribers.delete(growId);
    }
  };
};

export const refreshJournal = (growId: string): Promise<void> => sync(growId);

export const addJournalEntry = async (
  growId: string,
  entry: Partial<JournalEntry>
): Promise<JournalEntry> => {
  const payload = {
    ...entry,
    date: entry.date ?? new Date().toISOString(),
    notes: entry.notes ?? "",
    images: entry.images ?? [],
    tags: entry.tags ?? [],
    metrics: entry.metrics ?? {},
  };

  const res = await fetch(`${API_BASE}/${encodeURIComponent(growId)}/entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to add journal entry (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const saved = normalizeEntry(data?.entry ?? payload);
  const current = cache[growId] ?? [];
  const next = [saved, ...current.filter((item) => item.id !== saved.id)];
  setCache(growId, next);
  return saved;
};

export const deleteJournalEntry = async (growId: string, entryId: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(growId)}/entry/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to delete journal entry (${res.status}): ${detail}`);
  }

  const current = cache[growId] ?? [];
  setCache(growId, current.filter((entry) => entry.id !== entryId));
};
