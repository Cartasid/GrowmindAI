import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grow, JournalEntry, Language } from '../types';
import { loadJournal } from '../services/journalService';
import { X, BarChart, Calendar, Activity } from './icons';

interface MultiGrowComparisonProps {
  grows: Grow[];
  onClose: () => void;
  t: (key: string) => string;
  lang: Language;
}

type MetricKey = keyof JournalEntry['metrics'];

type MetricPoint = {
  day: number;
  value: number;
  growName: string;
};

type MetricSeries = {
  growId: string;
  growName: string;
  color: string;
  points: MetricPoint[];
};

const COLORS = ['#34d399', '#60a5fa', '#c084fc', '#f97316', '#f9a8d4', '#fbbf24', '#f87171'];

const METRICS: { key: MetricKey; labelKey: string; suffix: string; decimals: number }[] = [
  { key: 'plantHeight', labelKey: 'journal_plant_height', suffix: ' cm', decimals: 1 },
  { key: 'temp', labelKey: 'journal_temp', suffix: ' °C', decimals: 1 },
  { key: 'humidity', labelKey: 'journal_humidity', suffix: ' %', decimals: 1 },
  { key: 'ec', labelKey: 'journal_ec', suffix: '', decimals: 2 },
  { key: 'ph', labelKey: 'journal_ph', suffix: '', decimals: 2 },
];

const MultiGrowComparison: React.FC<MultiGrowComparisonProps> = ({ grows, onClose, t, lang }) => {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('plantHeight');
  const [allData, setAllData] = useState<Record<string, JournalEntry[]>>({});

  useEffect(() => {
    const loadAll = async () => {
      const data: Record<string, JournalEntry[]> = {};
      for (const grow of grows) {
        data[grow.id] = await loadJournal(grow.id);
      }
      setAllData(data);
    };
    loadAll();
  }, [grows]);

  const seriesData = useMemo(() => {
    return grows.map((grow, index) => {
      const entries = allData[grow.id] || [];
      const start = new Date(grow.startDate).getTime();
      const points = entries
        .map(entry => {
          const entryDate = new Date(entry.date).getTime();
          const day = Math.floor((entryDate - start) / (1000 * 60 * 60 * 24));
          const value = entry.metrics?.[activeMetric];
          return { day, value, growName: grow.name };
        })
        .filter(p => typeof p.value === 'number')
        .sort((a, b) => a.day - b.day);

      return {
        growId: grow.id,
        growName: grow.name,
        color: COLORS[index % COLORS.length],
        points: points as MetricPoint[]
      };
    });
  }, [allData, grows, activeMetric]);

  const maxDay = useMemo(() => {
    let max = 0;
    seriesData.forEach(s => {
      s.points.forEach(p => { if (p.day > max) max = p.day; });
    });
    return max || 30;
  }, [seriesData]);

  const yRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    seriesData.forEach(s => {
      s.points.forEach(p => {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      });
    });
    if (min === Infinity) return { min: 0, max: 100 };
    const pad = (max - min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }, [seriesData]);

  const width = 800;
  const height = 400;
  const margin = { top: 20, right: 150, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const toX = (day: number) => margin.left + (day / maxDay) * innerWidth;
  const toY = (val: number) => margin.top + (1 - (val - yRange.min) / (yRange.max - yRange.min)) * innerHeight;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-5xl bg-[#0e1728] border border-border rounded-xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <header className="flex justify-between items-center p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold text-text-strong flex items-center gap-2">
              <BarChart className="w-6 h-6 text-brand-b" />
              {t('grow_comparison_title') || 'Grow Comparison'}
            </h2>
            <p className="text-muted text-sm">{t('comparing_grows_desc') || 'Comparing metrics normalized by grow day'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </header>

        <div className="p-6 overflow-y-auto">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                className={`px-4 py-2 rounded-lg border whitespace-nowrap transition-all ${activeMetric === m.key ? 'bg-brand-b/20 border-brand-b text-brand-a font-bold' : 'border-border hover:bg-white/5'}`}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          <div className="relative bg-black/20 rounded-xl p-4 border border-border/50">
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(v => (
                <line key={v} x1={margin.left} y1={margin.top + v * innerHeight} x2={margin.left + innerWidth} y2={margin.top + v * innerHeight} stroke="#1f2937" strokeDasharray="4 4" />
              ))}

              {/* X Axis */}
              <line x1={margin.left} y1={margin.top + innerHeight} x2={margin.left + innerWidth} y2={margin.top + innerHeight} stroke="#374151" />
              {Array.from({length: 6}).map((_, i) => {
                const day = Math.floor((i / 5) * maxDay);
                const x = toX(day);
                return (
                  <g key={i}>
                    <line x1={x} y1={margin.top + innerHeight} x2={x} y2={margin.top + innerHeight + 5} stroke="#374151" />
                    <text x={x} y={margin.top + innerHeight + 20} textAnchor="middle" className="fill-muted text-[10px]">{t('day') || 'Day'} {day}</text>
                  </g>
                );
              })}

              {/* Y Axis */}
              <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerHeight} stroke="#374151" />
              {[0, 0.25, 0.5, 0.75, 1].map(v => {
                const val = yRange.max - v * (yRange.max - yRange.min);
                return (
                  <text key={v} x={margin.left - 10} y={margin.top + v * innerHeight} textAnchor="end" alignmentBaseline="middle" className="fill-muted text-[10px]">
                    {val.toFixed(METRICS.find(m => m.key === activeMetric)?.decimals || 1)}
                  </text>
                );
              })}

              {/* Data Lines */}
              {seriesData.map(s => (
                <g key={s.growId}>
                  <path
                    d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day)} ${toY(p.value)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-sm"
                  />
                  {s.points.map((p, i) => (
                    <circle key={i} cx={toX(p.day)} cy={toY(p.value)} r={4} fill={s.color} stroke="#0e1728" strokeWidth={1} />
                  ))}
                </g>
              ))}

              {/* Legend */}
              <g transform={`translate(${width - margin.right + 20}, ${margin.top})`}>
                {seriesData.map((s, i) => (
                  <g key={s.growId} transform={`translate(0, ${i * 25})`}>
                    <rect width={12} height={12} fill={s.color} rx={2} />
                    <text x={20} y={10} className="fill-text text-xs font-semibold">{s.growName}</text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiGrowComparison;
