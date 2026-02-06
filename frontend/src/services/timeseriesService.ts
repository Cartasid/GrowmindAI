import { apiUrl } from "../api";

export type TimeSeriesPoint = { t: string; v: number };
export type TimeSeriesResponse = {
  series: Record<string, TimeSeriesPoint[]>;
  range_hours: number;
  interval_minutes: number;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

export const fetchTimeSeries = async (payload: {
  entity_ids: string[];
  range_hours: number;
  interval_minutes: number;
}): Promise<TimeSeriesResponse> => {
  return requestJson<TimeSeriesResponse>("/api/timeseries/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};
