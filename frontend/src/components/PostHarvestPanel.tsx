import { useEffect, useMemo, useState } from "react";

import { fetchConfig, type ConfigMap } from "../services/configService";
import { useHaEntity } from "../hooks/useHaEntity";
import { saveAlert, saveTask } from "../services/operationsService";
import { fetchTimeSeries } from "../services/timeseriesService";
import { useToast } from "./ToastProvider";

const DEFAULT_THRESHOLDS = {
  dry_temp: { min: 18, max: 22, unit: "°C" },
  dry_humidity: { min: 55, max: 62, unit: "%" },
  dry_vpd: { min: 0.9, max: 1.3, unit: "kPa" },
  water_activity: { min: 0.55, max: 0.65, unit: "aw" },
};

const THRESHOLDS_STORAGE_KEY = "growmind.dryRoomThresholds";
const SOP_STORAGE_KEY = "growmind.dryRoomSop";

type DryRoomItem = {
  role?: string;
  label?: string;
  entity_id?: string;
  unit?: string;
  value?: string | number | null;
};

const statusFor = (role: string, value: number | null, thresholds: typeof DEFAULT_THRESHOLDS) => {
  const threshold = thresholds[role as keyof typeof DEFAULT_THRESHOLDS];
  if (!threshold || value == null) return "unknown";
  if (value < threshold.min || value > threshold.max) return "warn";
  return "ok";
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function PostHarvestPanel() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [seriesMap, setSeriesMap] = useState<Record<string, { t: string; v: number }[]>>({});
  const [sop, setSop] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as typeof DEFAULT_THRESHOLDS;
        setThresholds({ ...DEFAULT_THRESHOLDS, ...parsed });
      }
    } catch {
      setThresholds(DEFAULT_THRESHOLDS);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SOP_STORAGE_KEY);
      if (stored) {
        setSop(JSON.parse(stored));
      }
    } catch {
      setSop({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify(sop));
    } catch {
      // ignore
    }
  }, [sop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(thresholds));
    } catch {
      // ignore storage errors
    }
  }, [thresholds]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchConfig()
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch(() => {
        if (active) setConfig(null);
      })
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const dryRoomTargets = useMemo(() => (config?.dry_room?.targets ?? []) as DryRoomItem[], [config]);

  useEffect(() => {
    const entityIds = dryRoomTargets
      .map((item) => item.entity_id)
      .filter((id): id is string => Boolean(id));
    if (!entityIds.length) return;
    fetchTimeSeries({ entity_ids: entityIds, range_hours: 48, interval_minutes: 30 })
      .then((payload) => setSeriesMap(payload.series || {}))
      .catch(() => setSeriesMap({}));
  }, [dryRoomTargets]);

  const liveStates = dryRoomTargets.map((item) => ({
    item,
    state: useHaEntity(item.entity_id || undefined, 10),
  }));

  const handleCreateDefaultAlerts = async () => {
    try {
      const entries = Object.entries(thresholds);
      for (const [role, threshold] of entries) {
        await saveAlert({
          name: `Dry Room ${role}`,
          metric: role,
          operator: ">",
          threshold: threshold.max,
          severity: "warning",
          enabled: true,
        });
      }
      addToast({ title: "Dry Room Alerts erstellt", variant: "success" });
    } catch (err) {
      addToast({ title: "Alerts fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const updateThreshold = (role: keyof typeof DEFAULT_THRESHOLDS, key: "min" | "max", value: string) => {
    const numeric = Number(value.replace(",", "."));
    if (!Number.isFinite(numeric)) return;
    setThresholds((prev) => ({
      ...prev,
      [role]: { ...prev[role], [key]: numeric },
    }));
  };

  const resetThresholds = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    addToast({ title: "Defaults wiederhergestellt", variant: "success" });
  };

  const handleCreateTasks = async () => {
    try {
      await saveTask({
        title: "Dry Room Check",
        description: "Luftstrom, Filter, RH/Temp pruefen.",
        status: "open",
        priority: "high",
      });
      await saveTask({
        title: "Water Activity messen",
        description: "Wa-Probe aus mehreren Glases ziehen.",
        status: "open",
        priority: "medium",
      });
      addToast({ title: "Post-Harvest Tasks erstellt", variant: "success" });
    } catch (err) {
      addToast({ title: "Task Erstellung fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Post Harvest</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Dry Room Monitoring</h2>
          <p className="mt-2 text-sm text-white/60">Water Activity, RH, Temp und VPD fuer sichere Trocknung.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-1 text-xs text-brand-cyan"
          onClick={handleCreateDefaultAlerts}
        >
          Default Alerts erstellen
        </button>
        <button
          className="rounded-full border border-grow-lime/40 bg-grow-lime/10 px-4 py-1 text-xs text-grow-lime"
          onClick={handleCreateTasks}
        >
          Post-Harvest Tasks
        </button>
        <button
          className="rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/70"
          onClick={resetThresholds}
        >
          Defaults reset
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="meta-mono text-[11px] text-white/50">Dry Room Targets</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(DEFAULT_THRESHOLDS) as Array<keyof typeof DEFAULT_THRESHOLDS>).map((role) => {
            const entry = thresholds[role];
            return (
              <div key={role} className="glass-card rounded-2xl px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">{role}</p>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    value={entry.min}
                    onChange={(event) => updateThreshold(role, "min", event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                  />
                  <input
                    type="number"
                    value={entry.max}
                    onChange={(event) => updateThreshold(role, "max", event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                  />
                </div>
                <p className="mt-2 text-[10px] text-white/50">{entry.unit}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="meta-mono text-[11px] text-white/50">SOP Checklist</p>
        <div className="mt-3 space-y-2 text-xs text-white/70">
          {[
            "Filters checken",
            "Luftstrom pruefen",
            "RH/Temp verifizieren",
            "Water Activity Probe",
            "Daten ins Journal",
          ].map((item) => (
            <label key={item} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(sop[item])}
                onChange={(event) => setSop((prev) => ({ ...prev, [item]: event.target.checked }))}
              />
              {item}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {liveStates.map(({ item, state }) => {
          const value = toNumber(state.raw?.state ?? item.value);
          const role = item.role ?? "";
          const status = statusFor(role, value, thresholds);
          const threshold = thresholds[role as keyof typeof DEFAULT_THRESHOLDS];
          const series = item.entity_id ? seriesMap[item.entity_id] : undefined;
          const sparkline = (() => {
            if (!series || series.length < 2) return "";
            const values = series.map((point) => point.v);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min || 1;
            return values
              .slice(-12)
              .map((val, index, arr) => {
                const x = (index / Math.max(arr.length - 1, 1)) * 100;
                const y = 24 - ((val - min) / range) * 24;
                return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
              })
              .join(" ");
          })();
          return (
            <div key={role || item.label} className="glass-card rounded-2xl px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">{item.label || role}</p>
              <p className="mt-2 text-lg text-white">
                {value != null ? value.toFixed(2) : "—"} {item.unit || threshold?.unit || ""}
              </p>
              <p className={`mt-1 text-xs ${status === "warn" ? "text-brand-orange" : "text-white/50"}`}>
                {status === "warn" ? "Ausserhalb Target" : status === "ok" ? "Im Ziel" : "Kein Wert"}
              </p>
              {sparkline && (
                <svg viewBox="0 0 100 24" className="mt-2 h-6 w-full">
                  <path d={sparkline} fill="none" stroke="#2FE6FF" strokeWidth="2" />
                </svg>
              )}
            </div>
          );
        })}
        {liveStates.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
            Keine Dry-Room Sensoren gemappt.
          </div>
        )}
      </div>
    </section>
  );
}
