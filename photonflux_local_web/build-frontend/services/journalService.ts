import type { Cultivar, Substrate, JournalEntry } from '../types';


async function backendAvailable(): Promise<boolean> {
  try {
    const res = await fetch("api/health");
    return res.ok;
  } catch {
    return false;
  }
}

async function backendLoad(collection: string, key: string): Promise<any | null> {
  try {
    const res = await fetch(`api/store/${collection}/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

async function backendSave(collection: string, key: string, data: any): Promise<void> {
  try {
    await fetch(`api/store/${collection}/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  } catch (error) {
    console.error('Failed to persist journal data to backend', error);
  }
}

type JournalCache = Record<string, JournalEntry[]>;
type BackendStatus = 'unknown' | 'available' | 'unavailable';

const BACKEND_COLLECTION = 'photonfluxJournal';

const journalCache: JournalCache = {};
const journalSubscribers = new Map<string, Set<() => void>>();
const syncPromises = new Map<string, Promise<void>>();

let backendStatus: BackendStatus = 'unknown';

const ensureBackendStatus = async (): Promise<boolean> => {
  if (backendStatus === 'available') return true;
  if (backendStatus === 'unavailable') return false;
  const available = await backendAvailable();
  backendStatus = available ? 'available' : 'unavailable';
  return available;
};

const notifySubscribers = (key: string) => {
  const listeners = journalSubscribers.get(key);
  if (!listeners) return;
  listeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.error('Journal subscriber callback failed', error);
    }
  });
};

const persistToBackend = (key: string, data: JournalEntry[]): void => {
  ensureBackendStatus()
    .then(available => {
      if (!available) return;
      return backendSave(BACKEND_COLLECTION, key, data);
    })
    .catch(error => console.error('Failed to persist journal data', error));
};

const ensureJournalSynced = async (key: string): Promise<void> => {
  if (backendStatus === 'unavailable') return;
  if (syncPromises.has(key)) return syncPromises.get(key)!;

  const promise = (async () => {
    const available = await ensureBackendStatus();
    if (!available) return;

    try {
      const backendData = await backendLoad(BACKEND_COLLECTION, key);
      if (Array.isArray(backendData)) {
        const serialized = JSON.stringify(journalCache[key] ?? []);
        const incoming = JSON.stringify(backendData);
        if (serialized !== incoming) {
          journalCache[key] = backendData as JournalEntry[];
          notifySubscribers(key);
        }
      }
    } catch (error) {
      console.error('Failed to synchronise journal data', error);
    }
  })();

  syncPromises.set(key, promise);
  promise.finally(() => syncPromises.delete(key));
  return promise;
};

const getJournalKey = (growId: string): string => {
    return `journal_${growId}`;
};

export const loadJournal = (growId: string): JournalEntry[] => {
    const key = getJournalKey(growId);
    if (!journalCache[key]) {
        journalCache[key] = [];
    }
    void ensureJournalSynced(key);
    const entries = journalCache[key] ?? [];
    return [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const saveJournal = (growId: string, entries: JournalEntry[]): void => {
    const key = getJournalKey(growId);
    journalCache[key] = entries;
    persistToBackend(key, entries);
    notifySubscribers(key);
};

export const subscribe = (
    growId: string,
    listener: () => void,
): (() => void) => {
    const key = getJournalKey(growId);
    const listeners = journalSubscribers.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    journalSubscribers.set(key, listeners);
    void ensureJournalSynced(key);
    return () => {
        const bucket = journalSubscribers.get(key);
        if (!bucket) return;
        bucket.delete(listener);
        if (bucket.size === 0) {
            journalSubscribers.delete(key);
        }
    };
};