import React from 'react';
import type { NutrientProfile } from '../types';

interface PpmTableProps {
  ppm: Required<NutrientProfile>;
}

const PpmTable: React.FC<PpmTableProps> = ({ ppm }) => {
  const fmt = (v: number, d = 1) => Number(v).toFixed(d);
  const mic = (v: number) => Number(v).toFixed(2);

  const macros = [
    { key: 'N', val: fmt(ppm.N) },
    { key: 'P', val: fmt(ppm.P) },
    { key: 'K', val: fmt(ppm.K) },
    { key: 'Ca', val: fmt(ppm.Ca) },
    { key: 'Mg', val: fmt(ppm.Mg) },
    { key: 'S', val: fmt(ppm.S) },
  ];

  const micros = [
    { key: 'Fe', val: mic(ppm.Fe) },
    { key: 'Mn', val: mic(ppm.Mn) },
    { key: 'Zn', val: mic(ppm.Zn) },
    { key: 'Cu', val: mic(ppm.Cu) },
    { key: 'B', val: mic(ppm.B) },
    { key: 'Mo', val: mic(ppm.Mo) },
    { key: 'Na', val: fmt(ppm.Na) },
    { key: 'Cl', val: fmt(ppm.Cl) },
  ];

  return (
    <div className="overflow-x-auto bg-black/20 rounded-lg p-3">
        <h4 className="font-semibold text-cyan-300 mb-2">Nutrient Profile (PPM)</h4>
        <table className="w-full border-collapse">
            <thead>
                <tr className="border-b border-border">
                    {macros.map(el => <th key={el.key} className="th-ppm font-bold">{el.key}</th>)}
                </tr>
            </thead>
            <tbody>
                <tr className="border-b border-border/50">
                    {macros.map(el => <td key={el.key} className="td-ppm text-text-strong">{el.val}</td>)}
                </tr>
            </tbody>
            <thead>
                <tr className="border-t border-border/50 border-b border-border">
                    {micros.map(el => <th key={el.key} className="th-ppm font-bold">{el.key}</th>)}
                </tr>
            </thead>
            <tbody>
                <tr>
                    {micros.map(el => <td key={el.key} className="td-ppm text-text-strong">{el.val}</td>)}
                </tr>
            </tbody>
        </table>
    </div>
  );
};

const style = document.createElement('style');
style.innerHTML = `
  .th-ppm, .td-ppm {
    @apply p-2 text-sm text-center font-mono;
  }
`;
document.head.appendChild(style);

export default PpmTable;