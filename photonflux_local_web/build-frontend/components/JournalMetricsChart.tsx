import React, { useEffect, useMemo, useState, useRef } from 'react';
import type { JournalEntry, Language } from '../types';

export type MetricKey = keyof JournalEntry['metrics'];

type MetricPoint = {
  date: Date;
  isoDate: string;
  value: number;
  entryId: string;
};

export type MetricSeries = {
  key: MetricKey;
  points: MetricPoint[];
};

type MetricDefinition = {
  key: MetricKey;
  labelKey: string;
  color: string;
  decimals: number;
  suffix: string;
  min?: number;
};

type JournalMetricsChartProps = {
  entries: JournalEntry[];
  lang: Language;
  t: (key: string) => string;
  highlightEntryId?: string;
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'plantHeight',
    labelKey: 'journal_chart_metric_height',
    color: '#34d399',
    decimals: 1,
    suffix: ' cm',
    min: 0,
  },
  {
    key: 'temp',
    labelKey: 'journal_chart_metric_temp',
    color: '#60a5fa',
    decimals: 1,
    suffix: ' °C',
  },
  {
    key: 'humidity',
    labelKey: 'journal_chart_metric_humidity',
    color: '#c084fc',
    decimals: 1,
    suffix: ' %',
    min: 0,
  },
  {
    key: 'ec',
    labelKey: 'journal_chart_metric_ec',
    color: '#f97316',
    decimals: 2,
    suffix: '',
    min: 0,
  },
  {
    key: 'ph',
    labelKey: 'journal_chart_metric_ph',
    color: '#f9a8d4',
    decimals: 2,
    suffix: '',
  },
  {
    key: 'leafTemp',
    labelKey: 'journal_chart_metric_leaf_temp',
    color: '#10b981',
    decimals: 1,
    suffix: ' °C',
  },
  {
    key: 'vpd',
    labelKey: 'journal_chart_metric_vpd',
    color: '#8b5cf6',
    decimals: 2,
    suffix: ' kPa',
    min: 0,
  },
  {
    key: 'vwc',
    labelKey: 'journal_chart_metric_vwc',
    color: '#3b82f6',
    decimals: 1,
    suffix: ' %',
    min: 0,
  },
  {
    key: 'soilEc',
    labelKey: 'journal_chart_metric_soil_ec',
    color: '#d97706',
    decimals: 2,
    suffix: '',
    min: 0,
  },
];

const METRIC_LOOKUP = METRIC_DEFINITIONS.reduce<Record<MetricKey, MetricDefinition>>((acc, def) => {
  acc[def.key] = def;
  return acc;
}, {} as Record<MetricKey, MetricDefinition>);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatNumber = (lang: Language, value: number, decimals: number) =>
  new Intl.NumberFormat(lang, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

export const buildMetricSeries = (entries: JournalEntry[]): Record<MetricKey, MetricSeries> => {
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const initialSeries: Record<MetricKey, MetricSeries> = {
    plantHeight: { key: 'plantHeight', points: [] },
    temp: { key: 'temp', points: [] },
    humidity: { key: 'humidity', points: [] },
    ec: { key: 'ec', points: [] },
    ph: { key: 'ph', points: [] },
    leafTemp: { key: 'leafTemp', points: [] },
    vpd: { key: 'vpd', points: [] },
    vwc: { key: 'vwc', points: [] },
    soilEc: { key: 'soilEc', points: [] },
  };

  for (const entry of sortedEntries) {
    if (!entry.metrics) continue;
    const entryDate = new Date(entry.date);
    (Object.keys(initialSeries) as MetricKey[]).forEach((metricKey) => {
      const rawValue = entry.metrics?.[metricKey];
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        initialSeries[metricKey].points.push({
          date: entryDate,
          isoDate: entry.date,
          value: rawValue,
          entryId: entry.id,
        });
      }
    });
  }

  return initialSeries;
};

type TooltipState = {
  px: number;
  py: number;
  index: number;
  key: MetricKey;
  width: number;
};

type MetricChartProps = {
  series: MetricSeries;
  lang: Language;
  t: (key: string) => string;
  definition: MetricDefinition;
  highlightEntryId?: string;
};

const MetricChart: React.FC<MetricChartProps> = ({ series, lang, t, definition, highlightEntryId }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const points = series.points;
  const width = 320;
  const height = 160;
  const margin = { top: 12, right: 24, bottom: 36, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xValues = points.map((p) => p.date.getTime());
  const yValues = points.map((p) => p.value);
  const xMin = xValues.length > 0 ? Math.min(...xValues) : 0;
  const xMax = xValues.length > 0 ? Math.max(...xValues) : 1;
  const yMinRaw = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMaxRaw = yValues.length > 0 ? Math.max(...yValues) : 1;
  const yMin = definition.min !== undefined ? Math.min(definition.min, yMinRaw) : yMinRaw;
  const yRange = yMaxRaw - yMin;
  const paddedRange = yRange === 0 ? Math.max(Math.abs(yMaxRaw) * 0.1, 1) : yRange * 0.1;
  const rawDomainMin = yMin - paddedRange;
  const domainMin = definition.min !== undefined ? Math.max(definition.min, rawDomainMin) : rawDomainMin;
  const domainMax = yMaxRaw + paddedRange;
  const domainRange = domainMax - domainMin || 1;
  const xRange = xMax - xMin || 1;

  const toX = (date: Date) => {
    const relative = (date.getTime() - xMin) / xRange;
    return margin.left + relative * innerWidth;
  };

  const toY = (value: number) => {
    const relative = (value - domainMin) / domainRange;
    return margin.top + (1 - relative) * innerHeight;
  };

  const pathD = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.date)} ${toY(point.value)}`)
    .join(' ');

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const pointerX = clamp(event.clientX - rect.left - margin.left, 0, innerWidth);
    const targetTime = xMin + (pointerX / innerWidth) * xRange;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const distance = Math.abs(point.date.getTime() - targetTime);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    const chosenPoint = points[closestIndex];
    const viewX = toX(chosenPoint.date);
    const viewY = toY(chosenPoint.value);
    const px = (viewX / width) * rect.width;
    const py = (viewY / height) * rect.height;
    setTooltip({
      px,
      py,
      index: closestIndex,
      key: series.key,
      width: rect.width,
    });
  };

  const handlePointerLeave = () => setTooltip(null);

  const highlightedIndex = highlightEntryId
    ? points.findIndex((point) => point.entryId === highlightEntryId)
    : -1;

  const formatValueWithUnit = (value: number) =>
    `${formatNumber(lang, value, definition.decimals)}${definition.suffix}`.trim();

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  const tooltipPoint = tooltip ? points[tooltip.index] : null;

  return (
    <div className="bg-black/20 border border-border/40 rounded-lg p-3" role="group" aria-label={t(definition.labelKey)}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-text-strong">{t(definition.labelKey)}</span>
        {lastPoint && (
          <span className="text-xs text-muted">
            {t('journal_chart_axis_date')}: {lastPoint.date.toLocaleDateString(lang, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          role="img"
          aria-label={`${t(definition.labelKey)} ${t('journal_chart_title')}`}
        >
          <rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} fill="none" stroke="#1f2937" strokeDasharray="4 4" />
          {points.length > 0 && (
            <>
              <path d={pathD} fill="none" stroke={definition.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((point, index) => {
                const x = toX(point.date);
                const y = toY(point.value);
                const isHighlighted = index === highlightedIndex;
                return (
                  <g key={point.isoDate}>
                    {tooltip && tooltip.index === index && (
                      <line
                        x1={x}
                        x2={x}
                        y1={margin.top}
                        y2={margin.top + innerHeight}
                        stroke={definition.color}
                        strokeOpacity={0.3}
                        strokeDasharray="4 4"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={isHighlighted ? 5 : 4}
                      fill={definition.color}
                      stroke="#0f172a"
                      strokeWidth={isHighlighted ? 2 : 1}
                    />
                  </g>
                );
              })}
            </>
          )}
          <line x1={margin.left} y1={margin.top + innerHeight} x2={margin.left + innerWidth} y2={margin.top + innerHeight} stroke="#374151" strokeWidth={1} />
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerHeight} stroke="#374151" strokeWidth={1} />
          <text x={margin.left + innerWidth / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
            {t('journal_chart_axis_date')}
          </text>
          <text x={12} y={margin.top + innerHeight / 2} transform={`rotate(-90 12 ${margin.top + innerHeight / 2})`} textAnchor="middle" className="fill-muted text-[10px]">
            {t('journal_chart_axis_value')}
          </text>
          {points.length > 0 && (
            <>
              <text x={margin.left - 8} y={toY(domainMin)} textAnchor="end" alignmentBaseline="middle" className="fill-muted text-[10px]">
                {formatValueWithUnit(domainMin)}
              </text>
              <text x={margin.left - 8} y={toY(domainMax)} textAnchor="end" alignmentBaseline="middle" className="fill-muted text-[10px]">
                {formatValueWithUnit(domainMax)}
              </text>
              {firstPoint && (
                <text x={margin.left} y={margin.top + innerHeight + 12} textAnchor="start" className="fill-muted text-[10px]">
                  {firstPoint.date.toLocaleDateString(lang, { month: 'short', day: 'numeric' })}
                </text>
              )}
              {lastPoint && (
                <text x={margin.left + innerWidth} y={margin.top + innerHeight + 12} textAnchor="end" className="fill-muted text-[10px]">
                  {lastPoint.date.toLocaleDateString(lang, { month: 'short', day: 'numeric' })}
                </text>
              )}
            </>
          )}
        </svg>
        {tooltipPoint && tooltip && (
          <div
            className="absolute bg-[#111827] border border-border text-xs text-text px-2 py-1 rounded shadow-lg pointer-events-none"
            style={{
              left: tooltip.px < tooltip.width / 2 ? Math.max(0, tooltip.px - 16) : Math.max(0, tooltip.px - 140),
              top: Math.max(0, tooltip.py - 48),
              minWidth: 120,
            }}
          >
            <div className="font-semibold text-text-strong">{t(definition.labelKey)}</div>
            <div>{t('journal_chart_tooltip_date')}: {tooltipPoint.date.toLocaleDateString(lang)}</div>
            <div>{t('journal_chart_tooltip_value')}: {formatValueWithUnit(tooltipPoint.value)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const JournalMetricsChart: React.FC<JournalMetricsChartProps> = ({ entries, lang, t, highlightEntryId }) => {
  const series = useMemo(() => buildMetricSeries(entries), [entries]);
  const availableKeys = useMemo(
    () =>
      METRIC_DEFINITIONS.filter((definition) => series[definition.key].points.length > 0).map(
        (definition) => definition.key,
      ),
    [series],
  );
  const [activeKeys, setActiveKeys] = useState<MetricKey[]>(availableKeys);

  useEffect(() => {
    setActiveKeys((prev) => {
      const filtered = prev.filter((key) => availableKeys.includes(key));
      if (filtered.length > 0) {
        return filtered;
      }
      return availableKeys;
    });
  }, [availableKeys]);

  if (availableKeys.length === 0) {
    return (
      <div className="mt-4 p-4 bg-black/20 border border-border/40 rounded-lg">
        <h4 className="font-semibold text-text-strong mb-2">{t('journal_chart_title')}</h4>
        <p className="text-sm text-muted">{t('journal_chart_no_data')}</p>
      </div>
    );
  }

  const toggleKey = (key: MetricKey) => {
    setActiveKeys((prev) => {
      const isActive = prev.includes(key);
      if (isActive) {
        const next = prev.filter((item) => item !== key);
        return next.length === 0 ? prev : next;
      }
      return [...prev, key];
    });
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col gap-2">
        <div>
          <h4 className="font-semibold text-text-strong">{t('journal_chart_title')}</h4>
          <p className="text-xs text-muted">{t('journal_chart_toggle_label')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {METRIC_DEFINITIONS.filter((definition) => availableKeys.includes(definition.key)).map((definition) => {
            const isActive = activeKeys.includes(definition.key);
            return (
              <button
                key={definition.key}
                onClick={() => toggleKey(definition.key)}
                className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  isActive
                    ? 'bg-brand-b/20 border-brand-b text-brand-a'
                    : 'bg-black/40 border-border text-muted hover:bg-black/30'
                }`}
                type="button"
              >
                {t(definition.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      {activeKeys.map((key) => {
        const definition = METRIC_LOOKUP[key];
        return (
          <MetricChart
            key={key}
            series={series[key]}
            lang={lang}
            t={t}
            definition={definition}
            highlightEntryId={highlightEntryId}
          />
        );
      })}
    </div>
  );
};

export default JournalMetricsChart;
