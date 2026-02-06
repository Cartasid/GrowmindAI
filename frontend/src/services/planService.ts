import { apiUrl } from "../api";
import type { Cultivar, ManagedPlan, Substrate } from "../types";

export interface ActivePlanResponse {
  planId: string;
  plan: ManagedPlan;
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchAvailablePlans = async (
  cultivar: Cultivar,
  substrate: Substrate
): Promise<ManagedPlan[]> => {
  const query = `cultivar=${encodeURIComponent(cultivar)}&substrate=${encodeURIComponent(substrate)}`;
  return requestJson<ManagedPlan[]>(`/api/plans/available?${query}`);
};

export const fetchActivePlan = async (
  cultivar: Cultivar,
  substrate: Substrate
): Promise<ActivePlanResponse> => {
  const query = `cultivar=${encodeURIComponent(cultivar)}&substrate=${encodeURIComponent(substrate)}`;
  return requestJson<ActivePlanResponse>(`/api/plans/active?${query}`);
};

export const setActivePlan = async (
  cultivar: Cultivar,
  substrate: Substrate,
  planId: string
): Promise<string> => {
  const payload = { cultivar, substrate, planId };
  const response = await requestJson<{ planId: string }>("/api/plans/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.planId;
};

type PlanDraft = Omit<ManagedPlan, "id"> & { id?: string };

export const createPlan = async (
  cultivar: Cultivar,
  substrate: Substrate,
  plan: PlanDraft
): Promise<ManagedPlan> => {
  const payload = { cultivar, substrate, plan };
  return requestJson<ManagedPlan>("/api/plans/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const updatePlan = async (
  cultivar: Cultivar,
  substrate: Substrate,
  plan: ManagedPlan
): Promise<ManagedPlan> => {
  const payload = { cultivar, substrate, plan };
  return requestJson<ManagedPlan>("/api/plans/custom", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const deletePlan = async (
  cultivar: Cultivar,
  substrate: Substrate,
  planId: string
): Promise<void> => {
  const query = `cultivar=${encodeURIComponent(cultivar)}&substrate=${encodeURIComponent(substrate)}`;
  await requestJson<{ deleted: boolean }>(`/api/plans/custom/${encodeURIComponent(planId)}?${query}`,
    { method: "DELETE" }
  );
};
