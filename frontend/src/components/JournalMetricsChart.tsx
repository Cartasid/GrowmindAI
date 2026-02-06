import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { JournalEntry } from "../types";
import { fetchConfig, type ConfigMap } from "../services/configService";

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
  entryId: string;
};

const buildSeries = (entries: JournalEntry[], key: MetricKey) => {
  const points: MetricPoint[] = [];
  entries
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((entry) => {
      const value = entry.metrics?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        points.push({ value, date: new Date(entry.date), entryId: entry.id });
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
  highlightEntryId,
  onSelectEntry,
  targetRange,
}: {
  label: string;
  unit: string;
  color: string;
  points: MetricPoint[];
  highlightEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  targetRange?: { min?: number; max?: number } | null;
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
  const highlightIndex = highlightEntryId
    ? points.findIndex((point) => point.entryId === highlightEntryId)
    : -1;
  const highlightPoint = highlightIndex >= 0 ? points[highlightIndex] : null;

  const rangeValues = values.slice(-7);
  const rangeAverage = rangeValues.length
    ? rangeValues.reduce((sum, value) => sum + value, 0) / rangeValues.length
    : 0;
  const rangeVariance = rangeValues.length
    ? rangeValues.reduce((sum, value) => sum + (value - rangeAverage) ** 2, 0) / rangeValues.length
    : 0;
  const rangeDeviation = Math.sqrt(rangeVariance);
  const minBand = rangeAverage - rangeDeviation;
  const maxBand = rangeAverage + rangeDeviation;
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const bandMin = clamp(minBand, minValue, maxValue);
  const bandMax = clamp(maxBand, minValue, maxValue);
  const bandRange = maxValue - minValue || 1;
  const bandTop = height - ((bandMax - minValue) / bandRange) * height;
  const bandBottom = height - ((bandMin - minValue) / bandRange) * height;

  const targetMin = targetRange?.min;
  const targetMax = targetRange?.max;
  const targetBandTop =
    typeof targetMax === "number"
      ? height - ((targetMax - minValue) / bandRange) * height
      : null;
  const targetBandBottom =
    typeof targetMin === "number"
      ? height - ((targetMin - minValue) / bandRange) * height
      : null;

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
          onClick={() => {
            if (tooltipPoint && onSelectEntry) {
              onSelectEntry(tooltipPoint.entryId);
            }
          }}
        >
          {values.length > 1 && (
            <rect
              x={0}
              y={bandTop}
              width={width}
              height={Math.max(2, bandBottom - bandTop)}
              fill={`${color}20`}
            />
          )}
          {typeof targetBandTop === "number" && typeof targetBandBottom === "number" && (
            <rect
              x={0}
              y={Math.min(targetBandTop, targetBandBottom)}
              width={width}
              height={Math.max(2, Math.abs(targetBandBottom - targetBandTop))}
              fill={`${color}35`}
            />
          )}
          <path d={path} fill="none" stroke={color} strokeWidth="2" />
          {tooltipPoint && (
            <circle cx={tooltip?.x ?? 0} cy={tooltip?.y ?? 0} r={3} fill={color} />
          )}
          {highlightPoint && !tooltipPoint && (
            <circle
              cx={(highlightIndex / Math.max(points.length - 1, 1)) * width}
              cy={height - ((highlightPoint.value - minValue) / bandRange) * height}
              r={3}
              fill={color}
            />
          )}
        </svg>
        {tooltipPoint && (
          <div
            className="absolute -translate-x-1/2 -translate-y-2 rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-white/80"
            style={{ left: `${((tooltip?.x ?? 0) / width) * 100}%`, top: `${((tooltip?.y ?? 0) / height) * 100}%` }}
          >
            <div className="text-[10px] text-white/50">{formatDate(tooltipPoint.date)}</div>
            <div className="font-semibold text-white">
              {tooltipPoint.value.toFixed(2)} {unit}
            </div>
            {typeof targetMin === "number" && typeof targetMax === "number" && (
              <div className="text-[10px] text-white/50">
                Ziel {targetMin.toFixed(2)}-{targetMax.toFixed(2)} {unit}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function JournalMetricsChart({
  entries,
  highlightEntryId,
  onSelectEntry,
}: {
  entries: JournalEntry[];
  highlightEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
}) {
  const emptyTargets: Record<MetricKey, { min?: number; max?: number }> = {
    vpd: {},
    vwc: {},
    ec: {},
    ph: {},
  };
  const [targets, setTargets] = useState<Record<MetricKey, { min?: number; max?: number }>>(emptyTargets);

  const resolveRoleValue = (config: ConfigMap | null, role: string): number | null => {
    if (!config) return null;
    for (const category of Object.values(config)) {
      const inputs = Array.isArray(category?.inputs) ? category.inputs : [];
      const targets = Array.isArray(category?.targets) ? category.targets : [];
      const pool = inputs.concat(targets);
      for (const item of pool) {
        if (item?.role !== role) continue;
        const value = item?.value ?? item?.entity_id;
        const numeric = Number(String(value).replace(",", "."));
        if (Number.isFinite(numeric)) return numeric;
      }
    }
    return null;
  };

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((config) => {
        if (!active) return;
        const vpdMin = resolveRoleValue(config, "vpd_day_min");
        const vpdMax = resolveRoleValue(config, "vpd_day_max");
        const vwcMin = resolveRoleValue(config, "vwc_day_min");
        const vwcMax = resolveRoleValue(config, "vwc_day_max");
        const ecMin = resolveRoleValue(config, "ecp_day_min");
        const ecMax = resolveRoleValue(config, "ecp_day_max");
        const phTarget = resolveRoleValue(config, "ph_target");
        setTargets({
          vpd: { min: vpdMin ?? undefined, max: vpdMax ?? undefined },
          vwc: { min: vwcMin ?? undefined, max: vwcMax ?? undefined },
          ec: { min: ecMin ?? undefined, max: ecMax ?? undefined },
          ph:
            typeof phTarget === "number"
              ? { min: phTarget - 0.2, max: phTarget + 0.2 }
              : {},
        });
      })
      .catch(() => {
        if (!active) return;
        setTargets(emptyTargets);
      });
    return () => {
      active = false;
    };
  }, []);
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
            highlightEntryId={highlightEntryId}
            onSelectEntry={onSelectEntry}
            targetRange={targets[metric.key]}
          />
        ))}
      </div>
    </section>
  );
}
