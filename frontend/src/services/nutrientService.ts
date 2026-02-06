import { apiUrl } from "../api";
import type { Substrate } from "../types";

export interface MixRequest {
  current_week: string;
  reservoir_liters: number;
  cultivar?: string;
  substrate?: Substrate;
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
  const query = new URLSearchParams({
    current_week: payload.current_week,
    reservoir_liters: String(payload.reservoir_liters),
  });
  if (payload.cultivar) {
    query.set("cultivar", payload.cultivar);
  }
  if (payload.substrate) {
    query.set("substrate", payload.substrate);
  }
  return requestJson<MixResponse>(`/api/nutrients/plan?${query.toString()}`);
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
