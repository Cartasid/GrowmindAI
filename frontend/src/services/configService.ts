import { apiUrl } from "../api";

type ConfigItem = {
  role?: string;
  label?: string;
  entity_id?: string;
  type?: string;
  value?: string | number | null;
  read_only?: boolean;
};

type ConfigCategory = {
  label?: string;
  inputs?: ConfigItem[];
  targets?: ConfigItem[];
};

export type ConfigMap = Record<string, ConfigCategory>;

export type MappingOverrides = Record<string, Record<string, Record<string, string>>>;

export type SystemInfo = {
  cors_allowed_origins: string[];
  gemini_safety_threshold: string;
  log_format: string;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchConfig = async (): Promise<ConfigMap> => {
  return requestJson<ConfigMap>("/api/config");
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
