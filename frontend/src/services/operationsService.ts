import { apiUrl } from "../api";

export type Blueprint = {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
  stages?: Record<string, unknown>[];
};

export type Rule = {
  id?: string;
  name: string;
  enabled: boolean;
  when: string;
  then: string;
  priority?: string;
  notes?: string;
};

export type Task = {
  id?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  growId?: string | null;
  tags?: string[];
};

export type Batch = {
  id?: string;
  strain: string;
  room?: string;
  startDate?: string | null;
  harvestDate?: string | null;
  areaSqFt?: number | null;
  wetWeight?: number | null;
  dryWeight?: number | null;
  status?: string;
};

export type AlertConfig = {
  id?: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  severity?: string;
  enabled: boolean;
};

export type PredictResponse = {
  grow_id: string;
  risk_level: string;
  flags: Array<{ metric: string; value: number; mean: number; zscore: number }>;
  recommendations: string[];
  yield_forecast: null | {
    last_dry_weight: number;
    avg_dry_weight: number;
    best_dry_weight: number;
    samples: number;
  };
  data_points: number;
  last_observation?: { date?: string; metrics?: Record<string, unknown> };
  generated_at?: string;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchBlueprints = async (): Promise<Blueprint[]> => {
  const response = await requestJson<{ items: Blueprint[] }>("/api/ops/blueprints");
  return response.items ?? [];
};

export const saveBlueprint = async (payload: Blueprint): Promise<Blueprint> => {
  const response = await requestJson<{ item: Blueprint }>("/api/ops/blueprints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.item;
};

export const deleteBlueprint = async (id: string): Promise<void> => {
  await requestJson<{ status: string }>(`/api/ops/blueprints/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const fetchRules = async (): Promise<Rule[]> => {
  const response = await requestJson<{ items: Rule[] }>("/api/ops/rules");
  return response.items ?? [];
};

export const saveRule = async (payload: Rule): Promise<Rule> => {
  const response = await requestJson<{ item: Rule }>("/api/ops/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.item;
};

export const deleteRule = async (id: string): Promise<void> => {
  await requestJson<{ status: string }>(`/api/ops/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const fetchTasks = async (): Promise<Task[]> => {
  const response = await requestJson<{ items: Task[] }>("/api/ops/tasks");
  return response.items ?? [];
};

export const saveTask = async (payload: Task): Promise<Task> => {
  const response = await requestJson<{ item: Task }>("/api/ops/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.item;
};

export const deleteTask = async (id: string): Promise<void> => {
  await requestJson<{ status: string }>(`/api/ops/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const fetchBatches = async (): Promise<Batch[]> => {
  const response = await requestJson<{ items: Batch[] }>("/api/ops/batches");
  return response.items ?? [];
};

export const saveBatch = async (payload: Batch): Promise<Batch> => {
  const response = await requestJson<{ item: Batch }>("/api/ops/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.item;
};

export const deleteBatch = async (id: string): Promise<void> => {
  await requestJson<{ status: string }>(`/api/ops/batches/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const fetchAlerts = async (): Promise<AlertConfig[]> => {
  const response = await requestJson<{ items: AlertConfig[] }>("/api/ops/alerts");
  return response.items ?? [];
};

export const saveAlert = async (payload: AlertConfig): Promise<AlertConfig> => {
  const response = await requestJson<{ item: AlertConfig }>("/api/ops/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.item;
};

export const deleteAlert = async (id: string): Promise<void> => {
  await requestJson<{ status: string }>(`/api/ops/alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const fetchPredict = async (growId: string): Promise<PredictResponse> => {
  const response = await requestJson<PredictResponse>(`/api/ops/predict?grow_id=${encodeURIComponent(growId)}`);
  return response;
};
