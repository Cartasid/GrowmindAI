import type { Grow } from '../types';

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
    console.error('Failed to persist grow data to backend', error);
  }
}

const BACKEND_COLLECTION = 'photonflux_grows';
const BACKEND_GROWS_KEY = 'grows_list';

let growsCache: Grow[] = [];
let backendStatus: 'unknown' | 'available' | 'unavailable' = 'unknown';
const growSubscribers = new Set<() => void>();

const ensureBackendStatus = async (): Promise<boolean> => {
  if (backendStatus === 'available') return true;
  if (backendStatus === 'unavailable') return false;
  const available = await backendAvailable();
  backendStatus = available ? 'available' : 'unavailable';
  return available;
};

const notifySubscribers = () => {
  growSubscribers.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.error('Grow subscriber callback failed', error);
    }
  });
};

export const syncGrows = async (): Promise<Grow[]> => {
  const available = await ensureBackendStatus();
  if (!available) return growsCache;

  try {
    const data = await backendLoad(BACKEND_COLLECTION, BACKEND_GROWS_KEY);
    if (Array.isArray(data)) {
      growsCache = data;
      notifySubscribers();
    }
  } catch (error) {
    console.error('Failed to sync grows', error);
  }
  return growsCache;
};

export const getGrows = (): Grow[] => {
  return [...growsCache];
};

export const saveGrows = async (grows: Grow[]): Promise<void> => {
  growsCache = grows;
  const available = await ensureBackendStatus();
  if (available) {
    await backendSave(BACKEND_COLLECTION, BACKEND_GROWS_KEY, grows);
  }
  notifySubscribers();
};

export const addGrow = async (grow: Omit<Grow, 'id'>): Promise<Grow> => {
  const newGrow: Grow = {
    ...grow,
    id: `grow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const grows = [...growsCache, newGrow];
  await saveGrows(grows);
  return newGrow;
};

export const updateGrow = async (grow: Grow): Promise<void> => {
  const grows = growsCache.map(g => (g.id === grow.id ? grow : g));
  await saveGrows(grows);
};

export const deleteGrow = async (id: string): Promise<void> => {
  const grows = growsCache.filter(g => g.id !== id);
  await saveGrows(grows);
  // Note: We might want to also delete the journal associated with this grow.
};

export const subscribe = (listener: () => void): (() => void) => {
  growSubscribers.add(listener);
  return () => {
    growSubscribers.delete(listener);
  };
};

// Initial sync
void syncGrows();
