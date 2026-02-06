import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api";

export type HaEntityStatus = "idle" | "loading" | "ready" | "error";

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes?: Record<string, any>;
  last_updated?: string;
}

type EntityCacheItem = {
  etag: string | null;
  data: HaEntityState | null;
};

const entityCache = new Map<string, EntityCacheItem>();

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
        const cache = entityCache.get(entityId) ?? { etag: null, data: null };
        const headers: Record<string, string> = {};
        if (cache.etag) {
          headers["If-None-Match"] = cache.etag;
        }
        const res = await fetch(apiUrl(`/api/ha/state/${encodeURIComponent(entityId)}`), { headers });
        if (res.status === 304 && cache.data) {
          if (!active) return;
          setRaw(cache.data);
          setStatus("ready");
          return;
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        const json = (await res.json()) as HaEntityState;
        entityCache.set(entityId, { etag: res.headers.get("ETag"), data: json });
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
