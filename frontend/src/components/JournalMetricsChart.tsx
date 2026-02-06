import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { JournalEntry } from "../types";

const METRICS = [
  { key: "vpd", label: "VPD", unit: "kPa", color: "#6C5BFF" },
  { key: "vwc", label: "VWC", unit: "%", color: "#2FE6FF" },
  { key: "ec", label: "EC", unit: "mS", color: "#FF8A3D" },
  { key: "ph", label: "pH", unit: "", color: "#FF6BB5" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

type MetricPoint = {
  value: number;
  date: Date;
};

const buildSeries = (entries: JournalEntry[], key: MetricKey) => {
  const points: MetricPoint[] = [];
  entries
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((entry) => {
      const value = entry.metrics?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        points.push({ value, date: new Date(entry.date) });
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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatDate = (date: Date) => date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });

function MetricChart({
  label,
  unit,
  color,
  points,
}: {
  label: string;
  unit: string;
  color: string;
  points: MetricPoint[];
}) {
  const width = 240;
  const height = 80;
  const values = points.map((point) => point.value);
  const path = buildPath(values, width, height);
  const latest = values.length ? values[values.length - 1] : null;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltip, setTooltip] = useState<{ index: number; x: number; y: number } | null>(null);

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const index = Math.round((x / rect.width) * Math.max(points.length - 1, 1));
    const normalizedX = (index / Math.max(points.length - 1, 1)) * width;
    const value = points[index]?.value ?? 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const normalizedY = height - ((value - min) / range) * height;
    setTooltip({ index, x: normalizedX, y: normalizedY });
  };

  const handleLeave = () => setTooltip(null);

  const tooltipPoint = tooltip ? points[tooltip.index] : null;

  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
          <p className="mt-1 text-lg text-white">
            {latest != null ? latest.toFixed(2) : "—"} {unit}
          </p>
        </div>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="mt-3 relative">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          className="h-20 w-full"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          <path d={path} fill="none" stroke={color} strokeWidth="2" />
          {tooltipPoint && (
            <circle cx={tooltip.x} cy={tooltip.y} r={3} fill={color} />
          )}
        </svg>
        {tooltipPoint && (
          <div
            className="absolute -translate-x-1/2 -translate-y-2 rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-white/80"
            style={{ left: `${(tooltip.x / width) * 100}%`, top: `${(tooltip.y / height) * 100}%` }}
          >
            <div className="text-[10px] text-white/50">{formatDate(tooltipPoint.date)}</div>
            <div className="font-semibold text-white">
              {tooltipPoint.value.toFixed(2)} {unit}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
        {series.map((metric) => (
          <MetricChart
            key={metric.key}
            label={metric.label}
            unit={metric.unit}
            color={metric.color}
            points={metric.values}
          />
        ))}
      </div>
    </section>
  );
}
