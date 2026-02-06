import { useEffect, useMemo, useState } from "react";

import { fetchConfig, type ConfigMap } from "../services/configService";
import { useHaEntity } from "../hooks/useHaEntity";
import { saveAlert, saveTask } from "../services/operationsService";
import { useToast } from "./ToastProvider";

const DEFAULT_THRESHOLDS = {
  dry_temp: { min: 18, max: 22, unit: "°C" },
  dry_humidity: { min: 55, max: 62, unit: "%" },
  dry_vpd: { min: 0.9, max: 1.3, unit: "kPa" },
  water_activity: { min: 0.55, max: 0.65, unit: "aw" },
};

type DryRoomItem = {
  role?: string;
  label?: string;
  entity_id?: string;
  unit?: string;
  value?: string | number | null;
};

const statusFor = (role: string, value: number | null) => {
  const threshold = DEFAULT_THRESHOLDS[role as keyof typeof DEFAULT_THRESHOLDS];
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
  const { addToast } = useToast();

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

  const liveStates = dryRoomTargets.map((item) => ({
    item,
    state: useHaEntity(item.entity_id || undefined, 10),
  }));

  const handleCreateDefaultAlerts = async () => {
    try {
      const entries = Object.entries(DEFAULT_THRESHOLDS);
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
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {liveStates.map(({ item, state }) => {
          const value = toNumber(state.raw?.state ?? item.value);
          const role = item.role ?? "";
          const status = statusFor(role, value);
          const threshold = DEFAULT_THRESHOLDS[role as keyof typeof DEFAULT_THRESHOLDS];
          return (
            <div key={role || item.label} className="glass-card rounded-2xl px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">{item.label || role}</p>
              <p className="mt-2 text-lg text-white">
                {value != null ? value.toFixed(2) : "—"} {item.unit || threshold?.unit || ""}
              </p>
              <p className={`mt-1 text-xs ${status === "warn" ? "text-brand-orange" : "text-white/50"}`}>
                {status === "warn" ? "Ausserhalb Default" : status === "ok" ? "Im Ziel" : "Kein Wert"}
              </p>
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
