import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api";

export type HaEntityStatus = "idle" | "loading" | "ready" | "error";

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes?: Record<string, any>;
  last_updated?: string;
}

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const useHaEntity = (entityId?: string, pollSeconds: number = 5) => {
  const [status, setStatus] = useState<HaEntityStatus>(entityId ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<HaEntityState | null>(null);

  useEffect(() => {
    if (!entityId) {
      setStatus("idle");
      setRaw(null);
      return;
    }

    let active = true;
    let timer: any;

    const load = async () => {
      setStatus((prev) => (prev === "ready" ? "ready" : "loading"));
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/ha/state/${encodeURIComponent(entityId)}`));
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        const json = (await res.json()) as HaEntityState;
        if (!active) return;
        setRaw(json);
        setStatus("ready");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    };

    load();
    timer = setInterval(load, Math.max(2, pollSeconds) * 1000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [entityId, pollSeconds]);

  const valueNumber = useMemo(() => coerceNumber(raw?.state), [raw?.state]);

  return {
    status,
    error,
    raw,
    valueNumber,
  };
};
