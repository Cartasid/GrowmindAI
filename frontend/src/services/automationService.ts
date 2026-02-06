import { apiUrl } from "../api";

export type AutomationSummary = {
  entity_id: string;
  name: string;
  state: string;
  last_triggered?: string | null;
  description?: string | null;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchAutomations = async (): Promise<AutomationSummary[]> => {
  const response = await requestJson<{ automations: AutomationSummary[] }>("/api/ha/automations");
  return response.automations || [];
};

export const setAutomationEnabled = async (entityId: string, enabled: boolean): Promise<void> => {
  await requestJson<{ status: string }>("/api/ha/automations/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId, enabled }),
  });
};
