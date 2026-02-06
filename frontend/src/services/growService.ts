import type { Cultivar, Substrate } from "../types";

export type GrowStatus = "active" | "archived";

export type Grow = {
  id: string;
  name: string;
  cultivar: Cultivar;
  substrate: Substrate;
  startDate: string;
  status: GrowStatus;
};

const GROW_STORAGE_KEY = "growmind.grows";
const ACTIVE_GROW_KEY = "growmind.activeGrow";

const loadRaw = (): Grow[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GROW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean);
  } catch {
    return [];
  }
};

const saveRaw = (grows: Grow[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GROW_STORAGE_KEY, JSON.stringify(grows));
  } catch {
    // ignore
  }
};

export const getGrows = (): Grow[] => {
  const grows = loadRaw();
  if (!grows.length) {
    const seed: Grow = {
      id: "default",
      name: "Default",
      cultivar: "wedding_cake",
      substrate: "coco",
      startDate: new Date().toISOString().slice(0, 10),
      status: "active",
    };
    saveRaw([seed]);
    return [seed];
  }
  return grows;
};

export const saveGrows = (grows: Grow[]) => {
  saveRaw(grows);
};

export const getActiveGrowId = (): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_GROW_KEY);
};

export const setActiveGrowId = (growId: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_GROW_KEY, growId);
  } catch {
    // ignore
  }
};

export const addGrow = (grow: Omit<Grow, "id">): Grow => {
  const id = `grow_${Date.now().toString(36)}`;
  const next: Grow = { ...grow, id };
  const grows = getGrows();
  grows.push(next);
  saveRaw(grows);
  return next;
};

export const updateGrow = (updated: Grow): Grow[] => {
  const grows = getGrows().map((grow) => (grow.id === updated.id ? updated : grow));
  saveRaw(grows);
  return grows;
};

export const deleteGrow = (growId: string): Grow[] => {
  const grows = getGrows().filter((grow) => grow.id !== growId);
  saveRaw(grows);
  return grows.length ? grows : getGrows();
};
