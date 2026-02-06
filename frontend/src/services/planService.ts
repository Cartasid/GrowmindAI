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
