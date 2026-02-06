import type { Language, Phase, VegPhase, Plan, PlanEntry, WeekStartDay } from './types';
import { LeafIcon, FlowerIcon, HarvestIcon } from './components/icons';
import { I18N } from './constants';
import React from 'react';

export interface AnalyzerStructuredInputs {
    problemLocation?: string;
    problemSpread?: string;
    recentChanges?: string;
}

export const buildAnalyzerNotes = (
    baseNotes: string | undefined,
    structured: AnalyzerStructuredInputs,
): string => {
    const lines: string[] = [];

    const appendLine = (label: string, value: string | undefined) => {
        if (!value) {
            return;
        }
        const trimmed = value.trim();
        if (trimmed) {
            lines.push(`${label}: ${trimmed}`);
        }
    };

    if (typeof baseNotes === 'string') {
        const trimmed = baseNotes.trim();
        if (trimmed) {
            lines.push(trimmed);
        }
    }

    appendLine('Problem location', structured.problemLocation);
    appendLine('Spread speed', structured.problemSpread);
    appendLine('Recent changes', structured.recentChanges);

    return lines.join('\n');
};

export const generateClientId = (prefix = 'id'): string => {
    const globalObj: any = typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : undefined));
    const cryptoObj = globalObj?.crypto;

    if (cryptoObj) {
        if (typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID();
        }
        if (typeof cryptoObj.getRandomValues === 'function') {
            const buffer = new Uint8Array(16);
            cryptoObj.getRandomValues(buffer);
            const hex = Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
            return `${prefix}-${hex}`;
        }
    }

    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${timestamp}-${random}`;
};

const FLOWERING_WEEK_REGEX = /^W(\d+)$/i;

export const getWeekNumber = (phase: Phase): number | null => {
    if (!phase || typeof phase !== 'string') {
        return null;
    }
    const match = FLOWERING_WEEK_REGEX.exec(phase);
    if (!match) {
        return null;
    }
    const value = Number.parseInt(match[1], 10);
    return Number.isNaN(value) ? null : value;
};

export const getPhaseTag = (phase: Phase, lang: Language): string => {
    const tags = I18N[lang]?.tags || {};
    if (tags[phase]) {
        return tags[phase];
    }
    const weekNumber = getWeekNumber(phase);
    if (weekNumber === null) {
        return '';
    }
    if (weekNumber <= 1) {
        return tags['W1'] || '';
    }
    if (weekNumber <= 3) {
        return tags['W3'] || tags['W2'] || '';
    }
    if (weekNumber <= 8) {
        return tags['W5'] || tags['W4'] || '';
    }
    return tags['W9'] || tags['W10'] || '';
};

const VEG_PHASE_ORDER: VegPhase[] = ['Early Veg', 'Mid Veg', 'Late Veg'];

const ensureDurationDays = (entry: PlanEntry | undefined): number => {
    if (!entry || typeof entry.durationDays !== 'number') {
        return 7;
    }
    const numeric = Math.round(entry.durationDays);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 7;
    }
    return numeric;
};

export interface PlanScheduleEntry {
    phase: Phase;
    start: Date;
    end: Date;
    durationDays: number;
    notes?: string[];
}

const normaliseStartDate = (startDate: string): Date | null => {
    if (!startDate) {
        return null;
    }
    const date = new Date(`${startDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
};

export const computePlanSchedule = (plan: Plan, startDate: string, _weekStartsOn: WeekStartDay): PlanScheduleEntry[] => {
    const initial = normaliseStartDate(startDate);
    if (!initial) {
        return [];
    }
    const schedule: PlanScheduleEntry[] = [];
    let cursor = new Date(initial);

    for (const entry of plan) {
        const durationDays = ensureDurationDays(entry);
        const entryStart = new Date(cursor);
        const entryEnd = new Date(cursor);
        entryEnd.setUTCDate(entryEnd.getUTCDate() + durationDays);
        cursor = entryEnd;

        schedule.push({
            phase: entry.phase,
            start: entryStart,
            end: entryEnd,
            durationDays,
            notes: entry.notes,
        });
    }

    const lastFloweringWeek = schedule.slice().reverse().find(entry => getWeekNumber(entry.phase) !== null);

    if (lastFloweringWeek) {
        const harvestStart = lastFloweringWeek.end;
        const harvestEnd = new Date(harvestStart);
        harvestEnd.setUTCDate(harvestEnd.getUTCDate() + 1);

        schedule.push({
            phase: 'Harvest',
            start: harvestStart,
            end: harvestEnd,
            durationDays: 1,
        });
    }

    return schedule;
};

export const findScheduleIndexForDate = (schedule: PlanScheduleEntry[], targetDate: Date): number => {
    if (!schedule.length) {
        return -1;
    }
    const targetUTC = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
    ));

    for (let i = 0; i < schedule.length; i += 1) {
        const entry = schedule[i];
        if (targetUTC >= entry.start && targetUTC < entry.end) {
            return i;
        }
    }
    return -1;
};

export const toLocalDateFromUTC = (date: Date): Date => new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
);

export const sortPhases = (phases: Phase[]): Phase[] => {
    const seen = new Set<string>();
    const vegPhases = VEG_PHASE_ORDER.filter(phase => phases.includes(phase as Phase));
    const floweringPhases = phases
        .filter(phase => getWeekNumber(phase) !== null)
        .sort((a, b) => {
            const aWeek = getWeekNumber(a) ?? 0;
            const bWeek = getWeekNumber(b) ?? 0;
            return aWeek - bWeek;
        });
    const otherPhases = phases.filter(phase => !VEG_PHASE_ORDER.includes(phase as VegPhase) && getWeekNumber(phase) === null);

    const ordered: Phase[] = [...vegPhases, ...floweringPhases, ...otherPhases];
    const result: Phase[] = [];
    for (const phase of ordered) {
        if (!seen.has(phase)) {
            result.push(phase);
            seen.add(phase);
        }
    }
    return result;
};

/**
 * Determines the growth stage (VEG, BLOOM, RIPEN) based on the specific phase/week.
 * @param phase The current phase string (e.g., "Early Veg", "W1", "W9").
 * @returns An object containing the stage class, color, emoji icon, and React Icon component.
 */
export const getStageInfo = (phase: Phase): { class: 'VEG' | 'BLOOM' | 'RIPEN'; color: string; icon: string; IconComponent: React.FC<any> } => {
    const stageClasses = {
        VEG: { color: '#22c55e', icon: '🌿', IconComponent: LeafIcon },
        BLOOM: { color: '#7C4DFF', icon: '🌸', IconComponent: FlowerIcon },
        RIPEN: { color: '#FF6E40', icon: '🍂', IconComponent: HarvestIcon },
    };
    if (phase === 'Harvest') {
        return { class: 'RIPEN', ...stageClasses.RIPEN, color: '#FFC107' }; // Gold color
    }
    if (["Early Veg", "Mid Veg", "Late Veg"].includes(phase)) {
        return { class: 'VEG', ...stageClasses.VEG };
    }
    const weekNumber = getWeekNumber(phase);
    if (weekNumber !== null && weekNumber >= 9) {
        return { class: 'RIPEN', ...stageClasses.RIPEN };
    }
    return { class: 'BLOOM', ...stageClasses.BLOOM };
};

/**
 * Resizes an image file to a maximum width, maintaining aspect ratio, and returns a Base64 string.
 * @param file The image file to resize.
 * @param maxWidth The maximum width of the output image.
 * @returns A promise that resolves with the Base64 data URL of the resized image.
 */
export const resizeImage = (file: File, maxWidth: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("FileReader did not successfully read the file."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(maxWidth / img.width, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject('Could not get canvas context');
                }

                // Apply auto-brightness/contrast adjustments
                ctx.filter = 'brightness(1.1) contrast(1.1)';
                
                // Simple center crop logic
                const sourceX = (img.width - canvas.width / scale) / 2;
                const sourceY = (img.height - canvas.height / scale) / 2;
                const sourceWidth = canvas.width / scale;
                const sourceHeight = canvas.height / scale;

                ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
                
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% quality JPEG
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};