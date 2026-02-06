import type { Cultivar, Substrate, Plan, ManagedPlan, NutrientProfile, PlanEntry } from '../types';
import { DEFAULT_PLAN, DEFAULT_OSMOSIS_SHARES, DEFAULT_WATER_PROFILE } from '../constants';

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
    console.error('Failed to persist plan data to backend', error);
  }
}

type CustomPlansCache = Record<string, any[]>;
type ActivePlanCache = Record<string, string>;
type DefaultOverridesCache = Record<string, any>;

const BACKEND_COLLECTION = 'photonflux';
const BACKEND_CUSTOM_PLANS_KEY = 'customPlans';
const BACKEND_ACTIVE_PLAN_KEY = 'activePlanIds';
const BACKEND_DEFAULT_OVERRIDE_KEY = 'defaultPlanOverrides';

type BackendStatus = 'unknown' | 'available' | 'unavailable';
let backendStatus: BackendStatus = 'unknown';
let syncPromise: Promise<void> | null = null;

const planSubscribers = new Set<() => void>();

const sanitizeRecord = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
};

const sanitizeCustomPlans = (value: any): CustomPlansCache => {
  const record = sanitizeRecord(value);
  const sanitized: CustomPlansCache = {};
  for (const [key, entries] of Object.entries(record)) {
    if (Array.isArray(entries)) {
      sanitized[key] = entries.filter(item => item && typeof item === 'object');
    }
  }
  return sanitized;
};

const sanitizeActivePlans = (value: any): ActivePlanCache => {
  const record = sanitizeRecord(value);
  const sanitized: ActivePlanCache = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'string') {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

const sanitizeDefaultOverrides = (value: any): DefaultOverridesCache => {
  const record = sanitizeRecord(value);
  const sanitized: DefaultOverridesCache = {};
  for (const [key, val] of Object.entries(record)) {
    if (val && typeof val === 'object') {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

// --- In-Memory Caches ---
const customPlansCache: { value: CustomPlansCache } = {
  value: {},
};
const activePlanCache: { value: ActivePlanCache } = {
  value: {},
};
const defaultOverrideCache: { value: DefaultOverridesCache } = {
  value: {},
};

const notifySubscribers = () => {
  planSubscribers.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.error('Plan subscriber callback failed', error);
    }
  });
};

const ensureBackendStatus = async (): Promise<boolean> => {
  if (backendStatus === 'available') return true;
  if (backendStatus === 'unavailable') return false;
  const available = await backendAvailable();
  backendStatus = available ? 'available' : 'unavailable';
  return available;
};

const persistToBackend = (key: string, data: any): void => {
  ensureBackendStatus()
    .then(available => {
      if (!available) return;
      return backendSave(BACKEND_COLLECTION, key, data);
    })
    .catch(error => console.error('Failed to persist plan data', error));
};

const syncFromBackend = async (): Promise<void> => {
  if (backendStatus === 'unavailable') return;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const available = await ensureBackendStatus();
    if (!available) return;

    try {
      const [customPlans, activePlans, overrides] = await Promise.all([
        backendLoad(BACKEND_COLLECTION, BACKEND_CUSTOM_PLANS_KEY),
        backendLoad(BACKEND_COLLECTION, BACKEND_ACTIVE_PLAN_KEY),
        backendLoad(BACKEND_COLLECTION, BACKEND_DEFAULT_OVERRIDE_KEY),
      ]);

      let changed = false;

      if (customPlans) {
        const sanitized = sanitizeCustomPlans(customPlans);
        if (JSON.stringify(customPlansCache.value) !== JSON.stringify(sanitized)) {
          customPlansCache.value = sanitized;
          changed = true;
        }
      }

      if (activePlans) {
        const sanitized = sanitizeActivePlans(activePlans);
        if (JSON.stringify(activePlanCache.value) !== JSON.stringify(sanitized)) {
          activePlanCache.value = sanitized;
          changed = true;
        }
      }

      if (overrides) {
        const sanitized = sanitizeDefaultOverrides(overrides);
        if (JSON.stringify(defaultOverrideCache.value) !== JSON.stringify(sanitized)) {
          defaultOverrideCache.value = sanitized;
          changed = true;
        }
      }

      if (changed) {
        notifySubscribers();
      }
    } catch (error) {
      console.error('Failed to synchronise plan data from backend', error);
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
};

void syncFromBackend();

export const subscribe = (listener: () => void): (() => void) => {
  planSubscribers.add(listener);
  return () => {
    planSubscribers.delete(listener);
  };
};

const EDITABLE_DEFAULT_CULTIVARS: Cultivar[] = ['blue_dream', 'amnesia_haze'];
const editableDefaultCultivarSet = new Set<Cultivar>(EDITABLE_DEFAULT_CULTIVARS);

const NUTRIENT_KEYS: (keyof NutrientProfile)[] = ['N','P','K','Ca','Mg','S','Na','Fe','B','Mo','Mn','Zn','Cu','Cl'];

const generatePlanId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const clampShare = (value: number, substrate: Substrate): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_OSMOSIS_SHARES[substrate] ?? 0;
  }
  return Math.min(1, Math.max(0, value));
};

const clonePlanEntries = (plan: any): Plan => {
  if (!Array.isArray(plan)) return [];
  const sanitizeDurationDays = (value: any): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 7;
    }
    return Math.max(1, Math.round(numeric));
  };
  const sanitizeSilicateUnit = (value: any): 'per_liter' | 'per_plant' | undefined => {
    if (value === 'per_plant') return 'per_plant';
    if (value === 'per_liter') return 'per_liter';
    return undefined;
  };
  const sanitizeNotes = (value: any): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter(note => typeof note === 'string')
      .map(note => note.trim())
      .filter(note => note.length > 0);
  };
  return plan.map((entry: PlanEntry) => {
    const silicateRaw = (entry as any).Silicate ?? (entry as any).silicate;
    const silicateValue = silicateRaw !== undefined ? Number(silicateRaw) : undefined;
    const silicate = Number.isFinite(silicateValue as number) ? (silicateValue as number) : undefined;
    const notes = sanitizeNotes((entry as any).notes);
    const unit = sanitizeSilicateUnit((entry as any).SilicateUnit ?? (entry as any).silicateUnit);
    return {
      phase: entry.phase,
      A: Number(entry.A) || 0,
      X: Number((entry as any).X ?? (entry as any).B ?? 0) || 0,
      BZ: Number(entry.BZ) || 0,
      pH: typeof entry.pH === 'string' ? entry.pH : '',
      EC: typeof entry.EC === 'string' ? entry.EC : '',
      Tide: entry.Tide !== undefined ? Number(entry.Tide) : undefined,
      Helix: entry.Helix !== undefined ? Number(entry.Helix) : undefined,
      Ligand: entry.Ligand !== undefined ? Number(entry.Ligand) : undefined,
      Silicate: silicate,
      SilicateUnit: unit ?? (silicate !== undefined ? 'per_liter' : undefined),
      durationDays: sanitizeDurationDays((entry as any).durationDays),
      notes: notes.length ? notes : undefined,
    };
  });
};

const sanitizeWaterProfile = (input: any): NutrientProfile => {
  const base: NutrientProfile = { ...DEFAULT_WATER_PROFILE };
  if (input && typeof input === 'object') {
    for (const key of NUTRIENT_KEYS) {
      if (input[key] !== undefined) {
        const value = Number(input[key]);
        if (!Number.isNaN(value)) {
          base[key] = value;
        }
      }
    }
  }
  return base;
};

const normalizeManagedPlan = (planData: any, substrate: Substrate): ManagedPlan => {
  const rawPlan = Array.isArray(planData) ? planData : planData?.plan;
  const normalizedPlan = clonePlanEntries(rawPlan);
  const idRaw = typeof planData?.id === 'string' ? planData.id.trim() : '';
  const id = idRaw ? idRaw : generatePlanId();
  const name = typeof planData?.name === 'string' && planData.name.trim() ? planData.name : 'Custom Plan';
  const description = typeof planData?.description === 'string' ? planData.description : '';
  const waterProfile = sanitizeWaterProfile(planData?.waterProfile);
  const share = planData?.osmosisShare;
  const osmosisShare = clampShare(typeof share === 'number' ? share : DEFAULT_OSMOSIS_SHARES[substrate], substrate);

  return {
    id,
    name,
    description,
    plan: normalizedPlan,
    waterProfile,
    osmosisShare,
    isDefault: planData?.isDefault === true,
  };
};

// --- Helper Functions ---
const getComboKey = (cultivar: Cultivar, substrate: Substrate): string => `${cultivar}_${substrate}`;

const loadAllCustomPlans = (): Record<string, ManagedPlan[]> => {
  return customPlansCache.value as Record<string, ManagedPlan[]>;
};

const saveAllCustomPlans = (allPlans: Record<string, ManagedPlan[]>) => {
  const sanitized = sanitizeCustomPlans(allPlans);
  customPlansCache.value = sanitized;
  persistToBackend(BACKEND_CUSTOM_PLANS_KEY, sanitized);
  notifySubscribers();
};

const loadAllActivePlanIds = (): Record<string, string> => {
  return activePlanCache.value;
};

const saveAllActivePlanIds = (allIds: Record<string, string>) => {
  const sanitized = sanitizeActivePlans(allIds);
  activePlanCache.value = sanitized;
  persistToBackend(BACKEND_ACTIVE_PLAN_KEY, sanitized);
  notifySubscribers();
};

const loadDefaultPlanOverrides = (): Record<string, ManagedPlan> => {
  return defaultOverrideCache.value as Record<string, ManagedPlan>;
};

const saveDefaultPlanOverrides = (overrides: Record<string, ManagedPlan>) => {
  const sanitized = sanitizeDefaultOverrides(overrides);
  defaultOverrideCache.value = sanitized;
  persistToBackend(BACKEND_DEFAULT_OVERRIDE_KEY, sanitized);
  notifySubscribers();
};

const isEditableDefaultCultivar = (cultivar: Cultivar): boolean => editableDefaultCultivarSet.has(cultivar);
export const isDefaultPlanEditable = (cultivar: Cultivar): boolean => isEditableDefaultCultivar(cultivar);

// --- Exported Service Functions ---
/** Gets all custom plans for a specific cultivar and substrate. */
export const getCustomPlans = (cultivar: Cultivar, substrate: Substrate): ManagedPlan[] => {
  const allPlans = loadAllCustomPlans();
  const key = getComboKey(cultivar, substrate);
  const comboPlans = allPlans[key] || [];
  return comboPlans.map(plan => normalizeManagedPlan(plan, substrate));
};

/** Gets the default plan structured as a ManagedPlan object. */
export const getDefaultPlan = (cultivar: Cultivar, substrate: Substrate): ManagedPlan => {
  const cultivarPlans = DEFAULT_PLAN[cultivar];
  const basePlan = cultivarPlans?.[substrate];
  if (!basePlan) {
    return normalizeManagedPlan(
      {
        id: 'default',
        name: 'Default Plan',
        description: '',
        plan: [],
        waterProfile: DEFAULT_WATER_PROFILE,
        osmosisShare: DEFAULT_OSMOSIS_SHARES[substrate] ?? 0,
        isDefault: true,
      },
      substrate,
    );
  }
  const normalizedBase = normalizeManagedPlan(basePlan, substrate);
  if (!isEditableDefaultCultivar(cultivar)) {
    return normalizedBase;
  }

  const overrides = loadDefaultPlanOverrides();
  const overrideData = overrides[getComboKey(cultivar, substrate)];
  if (!overrideData) {
    return normalizedBase;
  }

  return normalizeManagedPlan(
    {
      ...overrideData,
      id: 'default',
      isDefault: true,
    },
    substrate,
  );
};

/** Gets all available plans (default + custom) for a combo. */
export const getAvailablePlans = (cultivar: Cultivar, substrate: Substrate): ManagedPlan[] => {
  const defaultPlan = getDefaultPlan(cultivar, substrate);
  const customPlans = getCustomPlans(cultivar, substrate);
  return [defaultPlan, ...customPlans];
};

/** Gets the ID of the active plan for a combo, defaulting to 'default'. */
export const getActivePlanId = (cultivar: Cultivar, substrate: Substrate): string => {
  const allIds = loadAllActivePlanIds();
  const key = getComboKey(cultivar, substrate);
  return allIds[key] || 'default';
};

/** Sets the active plan ID for a combo. */
export const setActivePlanId = (cultivar: Cultivar, substrate: Substrate, planId: string) => {
  const allIds = { ...loadAllActivePlanIds() };
  const key = getComboKey(cultivar, substrate);
  allIds[key] = planId;
  saveAllActivePlanIds(allIds);
};

/** Gets the plan data array for the currently active plan. */
export const getActivePlan = (cultivar: Cultivar, substrate: Substrate): ManagedPlan => {
  const activeId = getActivePlanId(cultivar, substrate);
  if (activeId === 'default') {
    return getDefaultPlan(cultivar, substrate);
  }
  const customPlans = getCustomPlans(cultivar, substrate);
  const activePlan = customPlans.find(p => p.id === activeId);
  return activePlan ? activePlan : getDefaultPlan(cultivar, substrate);
};

/** Saves a custom plan (creates if new, updates if exists). */
export const savePlan = (cultivar: Cultivar, substrate: Substrate, planToSave: ManagedPlan) => {
  if (planToSave.id === 'default' && isEditableDefaultCultivar(cultivar)) {
    const overrides = loadDefaultPlanOverrides();
    const normalizedDefault = normalizeManagedPlan(
      { ...planToSave, id: 'default', isDefault: true },
      substrate,
    );
    overrides[getComboKey(cultivar, substrate)] = normalizedDefault;
    saveDefaultPlanOverrides(overrides);
    return;
  }

  const allPlans = { ...loadAllCustomPlans() } as Record<string, ManagedPlan[]>;
  const key = getComboKey(cultivar, substrate);
  const comboPlans = [...(allPlans[key] || [])];

  const normalized = normalizeManagedPlan({ ...planToSave, isDefault: false }, substrate);
  const planToStore = JSON.parse(JSON.stringify(normalized));

  const existingIndex = comboPlans.findIndex((p: any) => p.id === planToStore.id);
  if (existingIndex > -1) {
    comboPlans[existingIndex] = planToStore;
  } else {
    comboPlans.push(planToStore);
  }

  allPlans[key] = comboPlans;
  saveAllCustomPlans(allPlans);
};

/** Creates a brand new custom plan entry with a generated ID. */
export const createPlan = (
  cultivar: Cultivar,
  substrate: Substrate,
  planData: Omit<ManagedPlan, 'id' | 'isDefault'>,
): ManagedPlan => {
  const allPlans = { ...loadAllCustomPlans() } as Record<string, ManagedPlan[]>;
  const key = getComboKey(cultivar, substrate);
  const comboPlans = [...(allPlans[key] || [])];

  const normalized = normalizeManagedPlan(
    { ...planData, id: generatePlanId(), isDefault: false },
    substrate,
  );
  const planToStore = JSON.parse(JSON.stringify(normalized));

  comboPlans.push(planToStore);
  allPlans[key] = comboPlans;
  saveAllCustomPlans(allPlans);

  return normalized;
};

/** Deletes a custom plan by its ID. */
export const deletePlan = (cultivar: Cultivar, substrate: Substrate, planId: string) => {
  if (planId === 'default') {
    if (isEditableDefaultCultivar(cultivar)) {
      const overrides = loadDefaultPlanOverrides();
      const key = getComboKey(cultivar, substrate);
      if (overrides[key]) {
        delete overrides[key];
        saveDefaultPlanOverrides(overrides);
      }
    }
    return;
  }

  const allPlans = { ...loadAllCustomPlans() } as Record<string, ManagedPlan[]>;
  const key = getComboKey(cultivar, substrate);
  const comboPlans = (allPlans[key] || []).filter(p => p.id !== planId);

  allPlans[key] = comboPlans;
  saveAllCustomPlans(allPlans);

  // If the deleted plan was active, reset active to default
  const activeId = getActivePlanId(cultivar, substrate);
  if (activeId === planId) {
    setActivePlanId(cultivar, substrate, 'default');
  }
};

/** Clears all custom plans and active plan settings. */
export const resetAllPlans = () => {
  customPlansCache.value = {};
  activePlanCache.value = {};
  defaultOverrideCache.value = {};
  persistToBackend(BACKEND_CUSTOM_PLANS_KEY, {});
  persistToBackend(BACKEND_ACTIVE_PLAN_KEY, {});
  persistToBackend(BACKEND_DEFAULT_OVERRIDE_KEY, {});
  notifySubscribers();
};
