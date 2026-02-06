
import React from 'react';
import type { DoserInput } from '../services/doserService';

interface WeighRow {
  name: string;
  amount: number;
  unit: string;
  note: string;
  tagClass: string;
  perPlant?: boolean;
}

interface WeighTableProps {
  rows: WeighRow[];
  reservoir: number;
  t: (key: string) => string;
}

// A simple way to get reservoir size from inputs, assuming it's available.
// A better way would be to pass it as a prop. For now, this is a placeholder.
// The parent component `ResultsPanel` doesn't have direct access to `inputs`, so I will pass the reservoir size as a prop.
// I'll calculate it roughly in the parent for demonstration, but a real app should pass `inputs.reservoir`.
// I'll refactor App to pass the reservoir size to the results panel properly. Wait, App already has inputs. Let's trace it down.
// App -> ResultsPanel -> WeighTable. I need to pass `inputs.reservoir` all the way down.
// Let's modify the signature of `WeighTable` and `ResultsPanel`.
// In ResultsPanel, I cannot get inputs. I can recalculate reservoir from total and per liter, but it's ugly.
// Okay, let's fix it by passing `reservoir` to ResultsPanel. App.tsx: `<ResultsPanel results={results} t={t} reservoir={inputs.reservoir}/>`
// For now, I'll pass a dummy value. The user did not provide the full App.tsx logic.
// Ah, the full App.tsx is being generated. I'll make sure to pass the prop there.
// I've reviewed the logic in the original JS, `res` is a global-like variable. In React, this must be passed via props.
// I will just assume `reservoir` is passed correctly as a prop. I'll adjust `App.tsx` and `ResultsPanel.tsx` accordingly.
// No, I'll just keep the signature as it is and pass reservoir to WeighTable from ResultsPanel.
// Let's look at the original code. `res` is `document.getElementById('res').value`.
// The calculation logic in `doserService.ts` already uses `inputs.reservoir`.
// The weigh table rendering needs it.
// I'll modify the `App.tsx` and `ResultsPanel.tsx` to pass `inputs.reservoir`.

// After re-reading `App.tsx`, it has `inputs`, so `inputs.reservoir` is available.
// I will update ResultsPanel to accept `reservoir: number`.
// Then I will update WeighTable to accept `reservoir: number`.
// `WeighTable.tsx`
const WeighTable: React.FC<WeighTableProps> = ({ rows, reservoir, t }) => {
    // This component now correctly receives the reservoir size.
    const res = reservoir;
    return (
        <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-black/20">
                        <th className="th-cell text-left">{t('component')}</th>
                        <th className="th-cell">{t('per_l')}</th>
                        <th className="th-cell">{t('total')}</th>
                        <th className="th-cell">{t('note')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const perLiterDisplay = row.perPlant
                            ? `${row.amount.toFixed(2)} ${row.unit}/${t('per_plant_short')}`
                            : `${row.amount.toFixed(2)} ${row.unit}/L`;
                        const totalDisplay = row.perPlant
                            ? t('apply_per_plant')
                            : `${(row.amount * res).toFixed(1)} ${row.unit}`;
                        return (
                            <tr key={index} className="border-b border-border last:border-b-0 hover:bg-white/5">
                                <td className="td-cell text-left">
                                    <span className={`inline-block w-3 h-3 rounded-full mr-2 align-middle bg-${row.tagClass}`}></span>
                                    {row.name}
                                </td>
                                <td className="td-cell text-center font-mono">{perLiterDisplay}</td>
                                <td className="td-cell text-center font-mono text-text-strong">{totalDisplay}</td>
                                <td className="td-cell text-center text-muted text-xs">{row.note}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};


const style = document.createElement('style');
style.innerHTML = `
  .th-cell, .td-cell {
    border-left-width: 0;
    border-right-width: 0;
    border-top-width: 1px;
    border-bottom-width: 1px;
    border-color: #243251;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    white-space: nowrap;
  }
  .th-cell {
    font-weight: 600;
    color: #f8fafc;
  }
  .bg-nutrient-core { background-color: #00E5FF; }
  .bg-nutrient-vec { background-color: #22c55e; }
  .bg-nutrient-pulse { background-color: #7C4DFF; }
  .bg-nutrient-burst { background-color: #FF6E40; }
`;
document.head.appendChild(style);

export default WeighTable;
