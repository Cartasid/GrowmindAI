import React from 'react';
import type { NutrientProfile } from '../types';
import Tooltip from './Tooltip';

interface NpkChartProps {
  ppm: Required<NutrientProfile>;
  npkRatio: string;
  t: (key: string) => string;
}

const NpkChart: React.FC<NpkChartProps> = ({ ppm, npkRatio, t }) => {
  const { N, P, K } = ppm;
  const values = [N, P, K];
  const maxValue = Math.ceil(Math.max(...values, 1) / 50) * 50; // Round up to nearest 50 for a nice scale

  const nutrients = [
    { name: 'Nitrogen (N)', value: N, color: 'bg-green-500' },
    { name: 'Phosphorus (P)', value: P, color: 'bg-orange-500' },
    { name: 'Potassium (K)', value: K, color: 'bg-purple-500' },
  ];

  return (
    <div className="bg-black/20 rounded-lg p-3 h-full flex flex-col border border-border">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-cyan-300">{t('npk_ratio_title')}</h4>
        <Tooltip text={t('tooltip_npk_ratio')}>
          <div className="text-right">
            <span className="font-mono text-lg text-text-strong block">{npkRatio}</span>
            <span className="text-xs text-muted">Ratio</span>
          </div>
        </Tooltip>
      </div>
      <div className="mt-4 flex-grow flex items-end justify-around gap-4" style={{ height: '120px' }}>
        {nutrients.map(nutrient => (
          <div key={nutrient.name} className="flex-1 h-full">
            <Tooltip text={`${nutrient.name}: ${nutrient.value.toFixed(1)} ppm`} className="h-full w-full flex">
              <div className="flex flex-col items-center justify-end h-full w-16 mx-auto">
                <span className="text-sm font-mono text-text-strong mb-1">{nutrient.value.toFixed(0)}</span>
                <div
                  className={`w-full rounded-t-md transition-all duration-500 ease-out ${nutrient.color}`}
                  style={{ height: `${(nutrient.value / maxValue) * 100}%` }}
                ></div>
                <span className="text-sm font-bold text-text-strong mt-2 pt-1 border-t-2 border-border w-full text-center">
                  {nutrient.name.split(' ')[1]}
                </span>
              </div>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NpkChart;
