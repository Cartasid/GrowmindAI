import { useEffect, useMemo, useState } from "react";

import { fetchConfig, type ConfigMap } from "../services/configService";
import { fetchTimeSeries, type TimeSeriesPoint } from "../services/timeseriesService";

type MetricItem = {
  key: string;
  label: string;
  unit: string;
  role: string;
  color: string;
  minRole?: string;
  maxRole?: string;
};

const METRICS: MetricItem[] = [
  { key: "vpd", label: "VPD", unit: "kPa", role: "actual_vpd", minRole: "vpd_day_min", maxRole: "vpd_day_max", color: "#6C5BFF" },
  { key: "temp", label: "Temperatur", unit: "°C", role: "actual_temp", minRole: "temp_day_min", maxRole: "temp_day_max", color: "#FF8A3D" },
  { key: "humidity", label: "Luftfeuchte", unit: "%", role: "actual_humidity", minRole: "hum_day_min", maxRole: "hum_day_max", color: "#2FE6FF" },
  { key: "vwc", label: "VWC", unit: "%", role: "actual_vwc", minRole: "vwc_day_min", maxRole: "vwc_day_max", color: "#14F195" },
  { key: "ecp", label: "ECp", unit: "mS/cm", role: "actual_ecp", minRole: "ecp_day_min", maxRole: "ecp_day_max", color: "#F97316" },
  { key: "co2", label: "CO₂", unit: "ppm", role: "actual_co2", color: "#F43F5E" },
];

type MetricKey = (typeof METRICS)[number]["key"];

type RangeOption = { label: string; hours: number; interval: number };

const RANGES: RangeOption[] = [
  { label: "24h", hours: 24, interval: 5 },
  { label: "7d", hours: 168, interval: 30 },
  { label: "30d", hours: 720, interval: 120 },
];

const resolveRoleEntity = (config: ConfigMap | null, role?: string) => {
  if (!config || !role) return null;
  for (const category of Object.values(config)) {
    const targets = Array.isArray(category?.targets) ? category.targets : [];
    const inputs = Array.isArray(category?.inputs) ? category.inputs : [];
    for (const item of [...targets, ...inputs]) {
      if (item?.role === role) return (item.entity_id as string) || null;
    }
  }
  return null;
};

const resolveRoleValue = (config: ConfigMap | null, role?: string) => {
  if (!config || !role) return null;
  for (const category of Object.values(config)) {
    const targets = Array.isArray(category?.targets) ? category.targets : [];
    const inputs = Array.isArray(category?.inputs) ? category.inputs : [];
    for (const item of [...targets, ...inputs]) {
      if (item?.role === role) {
        const raw = item.value ?? null;
        if (raw == null) return null;
        const parsed = Number(String(raw).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
  }
  return null;
};

const buildPath = (points: TimeSeriesPoint[], width: number, height: number) => {
  if (!points.length) return "";
  const values = points.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.v - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const getTrend = (points: TimeSeriesPoint[]) => {
  if (points.length < 6) return "—";
  const slice = points.slice(-6);
  const avg = slice.reduce((sum, p) => sum + p.v, 0) / slice.length;
  const start = slice[0].v;
  const end = slice[slice.length - 1].v;
  const diff = end - start;
  const pct = avg ? (diff / avg) * 100 : 0;
  if (Math.abs(pct) < 1) return "stabil";
  return pct > 0 ? "steigt" : "faellt";
};

export function TimeSeriesPanel() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [range, setRange] = useState<RangeOption>(RANGES[1]);
  const [series, setSeries] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((data) => {
        if (!active) return;
        setConfig(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const entityMap = useMemo(() => {
    const map: Record<MetricKey, string | null> = {} as Record<MetricKey, string | null>;
    METRICS.forEach((metric) => {
      map[metric.key] = resolveRoleEntity(config, metric.role) ?? null;
    });
    return map;
  }, [config]);

  useEffect(() => {
    const entityIds = Object.values(entityMap).filter((value): value is string => Boolean(value));
    if (!entityIds.length) return;
    setStatus("loading");
    setError(null);
    fetchTimeSeries({
      entity_ids: entityIds,
      range_hours: range.hours,
      interval_minutes: range.interval,
    })
      .then((data) => {
        setSeries(data.series || {});
        setStatus("ready");
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [entityMap, range]);

  const targetRange = (metric: typeof METRICS[number]) => {
    const minValue = metric.minRole ? resolveRoleValue(config, metric.minRole) : null;
    const maxValue = metric.maxRole ? resolveRoleValue(config, metric.maxRole) : null;
    return {
      min: Number.isFinite(minValue) ? minValue : null,
      max: Number.isFinite(maxValue) ? maxValue : null,
    };
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Zeitreihen</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Sensor Trends</h2>
          <p className="mt-2 text-sm text-white/60">Historische Trends aus InfluxDB.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((option) => (
            <button
              key={option.label}
              className={`rounded-full border px-3 py-1 text-xs ${
                range.label === option.label
                  ? "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan"
                  : "border-white/10 bg-black/30 text-white/60"
              }`}
              onClick={() => setRange(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-xs text-brand-red">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((metric) => {
          const entityId = entityMap[metric.key];
          const points = entityId ? series[entityId] || [] : [];
          const latest = points.length ? points[points.length - 1].v : null;
          const path = buildPath(points, 240, 80);
          const trend = getTrend(points);
          const target = targetRange(metric);
          const targetLabel =
            target.min != null && target.max != null ? `${target.min}–${target.max} ${metric.unit}` : "—";
          return (
            <div key={metric.key} className="glass-card rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{metric.label}</p>
                  <p className="mt-1 text-lg text-white">
                    {latest != null ? latest.toFixed(2) : "—"} {metric.unit}
                  </p>
                </div>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
              </div>
              <svg viewBox="0 0 240 80" className="mt-3 h-20 w-full">
                <path d={path} fill="none" stroke={metric.color} strokeWidth="2" />
              </svg>
              <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                <span>Trend: {trend}</span>
                <span>Ziel: {targetLabel}</span>
              </div>
            </div>
          );
        })}
      </div>

      {status === "loading" && (
        <p className="mt-4 text-xs text-white/50">Lade Zeitreihen...</p>
      )}
    </section>
  );
}
