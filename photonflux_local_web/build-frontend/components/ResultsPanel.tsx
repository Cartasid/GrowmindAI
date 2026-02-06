import React from 'react';
import type { CalculationResult } from '../services/doserService';
import WeighTable from './WeighTable';
import PpmTable from './PpmTable';
import NpkChart from './NpkChart';
import Tooltip from './Tooltip';
import { FlaskConical } from './icons';

interface ResultsPanelProps {
  results: CalculationResult;
  t: (key: string) => string;
  reservoir: number;
}

const DeltaValue: React.FC<{ value: number }> = ({ value }) => {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const colorClass = isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-muted';
  const sign = isPositive ? '+' : '';
  if (Math.abs(value) < 0.005) {
    return <span className="text-muted">0.00</span>
  }
  return <span className={`font-semibold ${colorClass}`}>{sign}{value.toFixed(2)}</span>;
};

const ValueDisplay: React.FC<{ label: string, value: number, unit?: string, className?: string}> = ({label, value, unit = "g/L", className}) => (
    <div className={`flex flex-col items-center justify-center text-center p-2 rounded-lg bg-black/20 ${className}`}>
        <span className="text-xs text-muted">{label}</span>
        <span className="text-lg font-bold text-text-strong">{value.toFixed(2)}</span>
        <span className="text-xs text-muted">{unit}</span>
    </div>
);


const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, t, reservoir }) => {
  const { baseLabel, baseValues, deltaValues, adjustedValues, weighTable, ppm, npkRatio, stageClass } = results;
  const tooltipX = baseValues.Xname === t('B_name') ? 'tooltip_B' : 'tooltip_C';
  
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 h-full flex flex-col">
        <h3 className="text-lg font-bold text-text-strong mb-2">{baseLabel}</h3>
        
        <div className="space-y-3 font-mono text-sm">
            {/* Base */}
            <details className="bg-black/20 rounded-lg p-3" open>
                <summary className="cursor-pointer font-semibold text-cyan-300">Base Plan</summary>
                <div className="grid grid-cols-3 gap-2 mt-2">
                    <Tooltip text={t('tooltip_A')}><ValueDisplay label={t('A_name')} value={baseValues.A} /></Tooltip>
                    <Tooltip text={t(tooltipX)}><ValueDisplay label={baseValues.Xname} value={baseValues.X} /></Tooltip>
                    <Tooltip text={t('tooltip_burst')}><ValueDisplay label={t('BURST_name')} value={baseValues.BZ} /></Tooltip>
                </div>
                {baseValues.additives && <p className="text-xs text-muted mt-2">{baseValues.additives.replace(/•/g, '').trim()}</p>}
            </details>

            {/* Delta */}
            <div className="bg-black/20 rounded-lg p-3">
                <h4 className="font-semibold text-cyan-300">Δ Adjustment</h4>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                    <div><span className="text-xs text-muted">{t('A_name')}</span><p><DeltaValue value={deltaValues.A} /></p></div>
                    <div><span className="text-xs text-muted">{deltaValues.Xname}</span><p><DeltaValue value={deltaValues.X} /></p></div>
                    <div><span className="text-xs text-muted">{t('BURST_name')}</span><p><DeltaValue value={deltaValues.BZ} /></p></div>
                </div>
            </div>

            {/* Adjusted */}
            <div className="bg-gradient-to-r from-brand-a/20 to-brand-b/20 rounded-lg p-3 border border-brand-b/50">
                <h4 className="font-semibold text-cyan-300">Final Dose</h4>
                 <div className="grid grid-cols-3 gap-2 mt-2">
                    <Tooltip text={t('tooltip_A')}><ValueDisplay label={t('A_name')} value={adjustedValues.A} className="bg-brand-a/10"/></Tooltip>
                    <Tooltip text={t(tooltipX)}><ValueDisplay label={adjustedValues.Xname} value={adjustedValues.X} className="bg-brand-a/10"/></Tooltip>
                    <Tooltip text={t('tooltip_burst')}><ValueDisplay label={t('BURST_name')} value={adjustedValues.BZ} className="bg-brand-a/10"/></Tooltip>
                </div>
                <div className="text-center text-amber-300 font-semibold mt-2 rounded bg-black/20 p-1">{t('target_ec')} {adjustedValues.ec}</div>
            </div>
        </div>

        <div className="flex-grow mt-4">
          <WeighTable rows={weighTable} reservoir={reservoir} t={t} />
        </div>
        
        <div className="flex flex-col gap-4 mt-4">
          <NpkChart ppm={ppm} npkRatio={npkRatio} t={t} />
          <PpmTable ppm={ppm} />
        </div>
    </div>
  );
};

export default ResultsPanel;