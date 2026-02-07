import { apiUrl } from "../api";
import type { Substrate } from "../types";

export interface MixRequest {
  current_week: string;
  reservoir_liters: number;
  cultivar?: string;
  substrate?: Substrate;
  plan_id?: string;
  observations?: Record<string, string>;
}

export interface TopDressItem {
  key: string;
  name: string;
  amount: number;
  unit: string;
  instruction?: string;
}

export interface MixResponse {
  mix: Record<string, number>;
  top_dress?: TopDressItem[];
  ppm?: Record<string, number>;
}

export interface MixConfirmResponse extends MixResponse {
  inventory: Record<string, InventoryItem>;
  alerts: InventoryAlert[];
  refill_needed: InventoryAlert[];
}

export interface InventoryItem {
  name: string;
  unit: string;
  full_size: number;
  threshold_warn: number;
  description?: string;
  group?: string;
  current: number;
  percent: number;
}

export interface InventoryAlert {
  key: string;
  name: string;
  unit: string;
  current: number;
  threshold_warn: number;
  message: string;
  reorder_url?: string;
}

export interface InventoryResponse {
  inventory: Record<string, InventoryItem>;
  alerts: InventoryAlert[];
  refill_needed: InventoryAlert[];
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchNutrientPlan = async (payload: MixRequest): Promise<MixResponse> => {
  return requestJson<MixResponse>("/api/nutrients/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const fetchInventory = async (): Promise<InventoryResponse> => {
  return requestJson<InventoryResponse>("/api/nutrients/inventory");
};

export const confirmNutrientMix = async (payload: MixRequest): Promise<MixConfirmResponse> => {
  return requestJson<MixConfirmResponse>("/api/nutrients/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const consumeInventory = async (payload: {
  consumption: Record<string, number>;
  substrate?: Substrate;
}): Promise<InventoryResponse> => {
  return requestJson<InventoryResponse>("/api/nutrients/inventory/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const setInventoryLevel = async (payload: {
  component: string;
  grams: number;
}): Promise<InventoryResponse> => {
  return requestJson<InventoryResponse>("/api/nutrients/inventory/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};
