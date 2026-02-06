import { useEffect, useMemo, useState } from "react";

import { getActiveGrowId, getGrows, type Grow } from "../services/growService";
import { loadJournal } from "../services/journalService";

const METRICS = [
  { key: "vpd", label: "VPD", unit: "kPa", color: "#38BDF8" },
  { key: "vwc", label: "VWC", unit: "%", color: "#22C55E" },
  { key: "ec", label: "EC", unit: "mS/cm", color: "#F97316" },
  { key: "ph", label: "pH", unit: "", color: "#A855F7" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

type SeriesPoint = { t: number; v: number };

type GrowSeries = {
  grow: Grow;
  points: SeriesPoint[];
  color: string;
};

const SERIES_COLORS = ["#38BDF8", "#22C55E", "#F97316", "#A855F7", "#FACC15", "#14B8A6"];

const buildSeries = (growId: string, metric: MetricKey): SeriesPoint[] => {
  const entries = loadJournal(growId) || [];
  return entries
    .map((entry) => ({
      t: new Date(entry.date).getTime(),
      v: entry.metrics?.[metric],
    }))
    .filter((point) => typeof point.v === "number")
    .sort((a, b) => a.t - b.t) as SeriesPoint[];
};

const buildPath = (points: SeriesPoint[], width: number, height: number, min: number, max: number) => {
  if (!points.length) return "";
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.v - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

export function GrowCompareTimeseries() {
  const [grows, setGrows] = useState<Grow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [metric, setMetric] = useState<MetricKey>("vpd");

  useEffect(() => {
    const data = getGrows();
    setGrows(data);
    const active = getActiveGrowId();
    const initial = active ? [active] : data.slice(0, 2).map((grow) => grow.id);
    setSelected(initial.length ? initial : data.slice(0, 1).map((grow) => grow.id));
  }, []);

  const series = useMemo(() => {
    return grows
      .filter((grow) => selected.includes(grow.id))
      .map((grow, index) => ({
        grow,
        points: buildSeries(grow.id, metric),
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }));
  }, [grows, selected, metric]);

  const valueRange = useMemo(() => {
    const values = series.flatMap((entry) => entry.points.map((point) => point.v));
    if (!values.length) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [series]);

  const metricLabel = METRICS.find((item) => item.key === metric);

  return (
    <section className="glass-card tactical-grid rounded-3xl p-5 shadow-neon">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Vergleich</p>
          <h3 className="gradient-text mt-2 text-xl font-light">Grow Vergleich</h3>
          <p className="mt-2 text-sm text-white/60">Mehrere Grows im Verlauf vergleichen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((item) => (
            <button
              key={item.key}
              className={`rounded-full border px-3 py-1 text-xs ${
                metric === item.key
                  ? "border-brand-cyan/60 bg-brand-cyan/20 text-brand-cyan"
                  : "border-white/10 bg-black/40 text-white/70"
              }`}
              onClick={() => setMetric(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {grows.map((grow) => (
          <button
            key={grow.id}
            className={`rounded-full border px-3 py-1 text-xs ${
              selected.includes(grow.id)
                ? "border-grow-lime/50 bg-grow-lime/10 text-grow-lime"
                : "border-white/10 bg-black/40 text-white/60"
            }`}
            onClick={() =>
              setSelected((prev) =>
                prev.includes(grow.id) ? prev.filter((id) => id !== grow.id) : [...prev, grow.id]
              )
            }
          >
            {grow.name}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>
            Metrik: {metricLabel?.label} {metricLabel?.unit ? `(${metricLabel.unit})` : ""}
          </span>
          <span>Linien: {series.length}</span>
        </div>
        <svg viewBox="0 0 320 120" className="mt-3 h-28 w-full">
          {series.map((entry) => {
            const path = buildPath(entry.points, 320, 120, valueRange.min, valueRange.max);
            return <path key={entry.grow.id} d={path} fill="none" stroke={entry.color} strokeWidth="2" />;
          })}
        </svg>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
          {series.map((entry) => (
            <span key={`${entry.grow.id}-legend`} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.grow.name}
            </span>
          ))}
          {!series.length && <span>Keine Daten fuer den Vergleich.</span>}
        </div>
      </div>
    </section>
  );
}
