import React, { useMemo } from 'react';
import type { Plan, Language } from '../types';

type PlanPrintoutProps = {
  plan: Plan;
  t: (key: string) => string;
  lang: Language;
};

const isVegPhase = (phase: string): boolean => ['Early Veg', 'Mid Veg', 'Late Veg'].includes(phase);

const formatAdditive = (value: number | undefined, unit: string): string => {
  if (!value || value <= 0) return '';
  return `${value.toFixed(2)} ${unit}`;
};

const PlanPrintout: React.FC<PlanPrintoutProps> = ({ plan, t }) => {
  const headerX = useMemo(() => `${t('B_name')} / ${t('C_name')}`, [t]);

  return (
    <div className="text-black">
      <h1 className="text-2xl font-bold mb-2">{t('plan_print_title')}</h1>
      <p className="text-sm mb-6">{t('plan_print_description')}</p>
      <table className="w-full border border-black/40 border-collapse text-xs">
        <thead className="bg-gray-100">
          <tr>
            <th className="border border-black/20 px-2 py-1 text-left">{t('phase_week')}</th>
            <th className="border border-black/20 px-2 py-1 text-center">{t('plan_print_duration')}</th>
            <th className="border border-black/20 px-2 py-1 text-center">{`${t('A_name')} (g/L)`}</th>
            <th className="border border-black/20 px-2 py-1 text-center">{`${headerX} (g/L)`}</th>
            <th className="border border-black/20 px-2 py-1 text-center">{`${t('BURST_name')} (g/L)`}</th>
            <th className="border border-black/20 px-2 py-1 text-center">Tide (g/L)</th>
            <th className="border border-black/20 px-2 py-1 text-center">Helix (ml/L)</th>
            <th className="border border-black/20 px-2 py-1 text-center">Ligand (ml/L)</th>
            <th className="border border-black/20 px-2 py-1 text-center">{`${t('silicate_name')}`}</th>
            <th className="border border-black/20 px-2 py-1 text-center">pH</th>
            <th className="border border-black/20 px-2 py-1 text-center">EC</th>
            <th className="border border-black/20 px-2 py-1 text-left">{t('plan_print_notes')}</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((entry, index) => {
            const xLabel = isVegPhase(entry.phase) ? t('B_name') : t('C_name');
            const silicateValue = typeof entry.Silicate === 'number' ? entry.Silicate : 0;
            const silicateUnit = entry.SilicateUnit === 'per_plant' ? `${silicateValue.toFixed(2)} g/${t('per_plant_short')}`
              : silicateValue > 0
                ? `${silicateValue.toFixed(2)} g/L`
                : '';
            const notes = (entry.notes || []).map(noteKey => t(noteKey)).join(' ');

            return (
              <tr key={`${entry.phase}-${index}`} className="odd:bg-white even:bg-gray-50">
                <td className="border border-black/20 px-2 py-1 text-left font-semibold">{entry.phase}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{Math.max(1, Math.round(entry.durationDays ?? 7))}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{entry.A.toFixed(2)}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{`${entry.X.toFixed(2)} (${xLabel})`}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{entry.BZ.toFixed(2)}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{formatAdditive(entry.Tide, 'g/L')}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{formatAdditive(entry.Helix, 'ml/L')}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{formatAdditive(entry.Ligand, 'ml/L')}</td>
                <td className="border border-black/20 px-2 py-1 text-center">{silicateUnit}</td>
                <td className="border border-black/20 px-2 py-1 text-center font-mono text-sm">{entry.pH}</td>
                <td className="border border-black/20 px-2 py-1 text-center font-mono text-sm">{entry.EC}</td>
                <td className="border border-black/20 px-2 py-1 text-left whitespace-pre-line">{notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PlanPrintout;
