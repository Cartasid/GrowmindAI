import { useMemo } from "react";
import type { JournalEntry } from "../types";

const METRICS = [
  { key: "vpd", label: "VPD", unit: "kPa", color: "#6C5BFF" },
  { key: "vwc", label: "VWC", unit: "%", color: "#2FE6FF" },
  { key: "ec", label: "EC", unit: "mS", color: "#FF8A3D" },
  { key: "ph", label: "pH", unit: "", color: "#FF6BB5" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const buildSeries = (entries: JournalEntry[], key: MetricKey) => {
  const points: number[] = [];
  entries
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((entry) => {
      const value = entry.metrics?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        points.push(value);
      }
    });
  return points;
};

const buildPath = (values: number[], width: number, height: number) => {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

export function JournalMetricsChart({ entries }: { entries: JournalEntry[] }) {
  const series = useMemo(
    () =>
      METRICS.map((metric) => ({
        ...metric,
        values: buildSeries(entries, metric.key),
      })),
    [entries]
  );

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Trends</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Journal Metrics</h2>
          <p className="mt-2 text-sm text-white/60">VPD, VWC, EC und pH Verlauf.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {series.map((metric) => {
          const width = 240;
          const height = 80;
          const path = buildPath(metric.values, width, height);
          const latest = metric.values.length ? metric.values[metric.values.length - 1] : null;
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
              <div className="mt-3">
                <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="h-20 w-full">
                  <path d={path} fill="none" stroke={metric.color} strokeWidth="2" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
