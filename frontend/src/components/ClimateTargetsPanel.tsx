import { useEffect, useMemo, useState } from "react";

import { fetchConfig, type ConfigMap } from "../services/configService";

const TARGET_SETS = [
  { title: "VPD Tag", minRole: "vpd_day_min", maxRole: "vpd_day_max", unit: "kPa" },
  { title: "VPD Nacht", minRole: "vpd_night_min", maxRole: "vpd_night_max", unit: "kPa" },
  { title: "Temperatur Tag", minRole: "temp_day_min", maxRole: "temp_day_max", unit: "°C" },
  { title: "Temperatur Nacht", minRole: "temp_night_min", maxRole: "temp_night_max", unit: "°C" },
  { title: "Luftfeuchte Tag", minRole: "hum_day_min", maxRole: "hum_day_max", unit: "%" },
  { title: "Luftfeuchte Nacht", minRole: "hum_night_min", maxRole: "hum_night_max", unit: "%" },
];

type TargetValueMap = Record<string, number | null>;

type PanelStatus = "idle" | "loading" | "ready" | "error";

const parseNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function ClimateTargetsPanel() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchConfig()
      .then((data) => {
        if (!active) return;
        setConfig(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const targetValues = useMemo(() => {
    const values: TargetValueMap = {};
    const targets = config?.climate_targets?.targets ?? [];
    targets.forEach((item) => {
      if (!item?.role) return;
      values[item.role] = parseNumber(item.value);
    });
    return values;
  }, [config]);

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Climate</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Zielwerte</h2>
          <p className="mt-2 text-sm text-white/60">Tag/Nacht Targets aus der Konfiguration.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">
          {status === "loading" ? "Laedt" : status === "error" ? "Fehler" : "Bereit"}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-xs text-brand-red">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TARGET_SETS.map((set) => {
          const minValue = targetValues[set.minRole];
          const maxValue = targetValues[set.maxRole];
          return (
            <div key={set.title} className="glass-card rounded-2xl px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">{set.title}</p>
              <div className="mt-2 text-sm text-white/80">
                <span>Min: {minValue != null ? minValue.toFixed(1) : "—"} {set.unit}</span>
                <span className="ml-3">Max: {maxValue != null ? maxValue.toFixed(1) : "—"} {set.unit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
