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
