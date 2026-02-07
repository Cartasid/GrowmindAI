import { apiUrl } from "../api";

type ConfigItem = {
  role?: string;
  label?: string;
  entity_id?: string;
  type?: string;
  unit?: string;
  value?: string | number | null;
  read_only?: boolean;
};

type ConfigCategory = {
  label?: string;
  inputs?: ConfigItem[];
  targets?: ConfigItem[];
};

export type ConfigMap = Record<string, ConfigCategory>;

export type HaEntityInfo = {
  entity_id: string;
  friendly_name?: string;
};

export type MappingOverrides = Record<string, Record<string, Record<string, string>>>;

export type SystemInfo = {
  cors_allowed_origins: string[];
  gemini_safety_threshold: string;
  log_format: string;
  grafana_embed_url?: string;
};

export type HvacAutoResult = {
  status: string;
  inputs: {
    temp_actual: number | null;
    temp_target: number | null;
    hum_actual: number | null;
    hum_target: number | null;
  };
  decisions: {
    heater_on: boolean;
    ac_on: boolean;
    dehumidifier_on: boolean;
    humidifier_on: boolean;
    fan_target: number;
  };
  actions: Record<string, boolean>;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    if (response.status === 304) {
      throw new Error("Not modified");
    }
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

let configCache: ConfigMap | null = null;
let configEtag: string | null = null;
let entitiesCache: HaEntityInfo[] | null = null;
let entitiesEtag: string | null = null;

export const fetchConfig = async (): Promise<ConfigMap> => {
  const headers: Record<string, string> = {};
  if (configEtag) {
    headers["If-None-Match"] = configEtag;
  }
  const response = await fetch(apiUrl("/api/config"), { headers });
  if (response.status === 304 && configCache) {
    return configCache;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  configEtag = response.headers.get("ETag");
  configCache = (await response.json()) as ConfigMap;
  return configCache;
};

export const updateMapping = async (payload: {
  category: string;
  section: "inputs" | "targets";
  role: string;
  entity_id: string;
}): Promise<void> => {
  await requestJson<{ status: string }>("/api/config/mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const fetchMappingOverrides = async (): Promise<MappingOverrides> => {
  const response = await requestJson<{ overrides: MappingOverrides }>("/api/config/mapping");
  return response.overrides;
};

export const importMappingOverrides = async (overrides: MappingOverrides): Promise<void> => {
  await requestJson<{ status: string }>("/api/config/mapping/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides }),
  });
};

export const fetchSystemInfo = async (): Promise<SystemInfo> => {
  return requestJson<SystemInfo>("/api/system/info");
};

export const fetchHaEntities = async (): Promise<HaEntityInfo[]> => {
  const headers: Record<string, string> = {};
  if (entitiesEtag) {
    headers["If-None-Match"] = entitiesEtag;
  }
  const response = await fetch(apiUrl("/api/ha/entities"), { headers });
  if (response.status === 304 && entitiesCache) {
    return entitiesCache;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  entitiesEtag = response.headers.get("ETag");
  entitiesCache = (await response.json()) as HaEntityInfo[];
  return entitiesCache;
};

export const updateConfigValue = async (payload: {
  category: string;
  role: string;
  value: string | number | boolean | { date?: string; time?: string } | null;
}): Promise<void> => {
  await requestJson<{ status: string }>("/api/config/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const runHvacAuto = async (): Promise<HvacAutoResult> => {
  return requestJson<HvacAutoResult>("/api/control/hvac/auto", {
    method: "POST",
  });
};
