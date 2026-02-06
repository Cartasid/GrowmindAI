import React from 'react';
import type { NutrientProfile, StageClass } from '../types';
// FIX: Changed import from '../services/doserService' to '../constants' to resolve missing export error.
import { NUTRIENT_TARGET_RANGES } from '../constants';

interface NutrientChartProps {
    ppm: Required<NutrientProfile>;
    stageClass: StageClass;
}

const NutrientChart: React.FC<NutrientChartProps> = ({ ppm, stageClass }) => {
    const nutrients: (keyof NutrientProfile)[] = ['N', 'P', 'K', 'Ca', 'Mg'];
    const targets = NUTRIENT_TARGET_RANGES[stageClass];

    const chartData = nutrients.map(name => {
        const key = name as keyof NutrientProfile;
        const targetRange = targets[key];
        return {
            name,
            ppm: ppm[key] || 0,
            min: targetRange?.min || 0,
            max: targetRange?.max || 0,
        };
    });

    const maxValue = Math.ceil(Math.max(...chartData.map(d => Math.max(d.ppm, d.max))) * 1.1 / 50) * 50;

    const getBarColor = (value: number, min: number, max: number): string => {
        if (value >= min && value <= max) {
            return '#22c55e'; // green-500
        }
        return '#f97316'; // orange-500
    };

    return (
        <div className="space-y-3 font-mono">
            {chartData.map(item => (
                <div key={item.name} className="grid grid-cols-[30px_1fr_40px] gap-2 items-center text-sm" title={`Target: ${item.min}-${item.max} ppm`}>
                    <div className="font-bold text-text-strong text-right">{item.name}</div>
                    <div className="w-full bg-black/30 rounded h-5 relative overflow-hidden">
                        {/* Target range background */}
                        <div
                            className="absolute h-full bg-green-500/20"
                            style={{
                                left: `${(item.min / maxValue) * 100}%`,
                                width: `${((item.max - item.min) / maxValue) * 100}%`,
                            }}
                        />
                        {/* Actual value bar */}
                        <div
                            className="absolute h-full rounded-r transition-all duration-500 ease-out flex items-center justify-end pr-2"
                            style={{
                                width: `${(item.ppm / maxValue) * 100}%`,
                                backgroundColor: getBarColor(item.ppm, item.min, item.max),
                            }}
                        >
                        </div>
                    </div>
                    <div className="text-right text-muted text-xs tabular-nums">{item.ppm.toFixed(0)}</div>
                </div>
            ))}
        </div>
    );
};

export default NutrientChart;
