import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Language,
  Cultivar,
  Substrate,
  ManagedPlan,
  Phase,
  NutrientProfile,
  PlanOptimizerWeekInput,
  PlanOptimizationResponse,
  PlanOptimizerStage,
  NutrientKey,
  PlanOptimizationSuggestion,
  NutrientTargets,
} from '../types';
import { generateClientId, getWeekNumber } from '../utils';
import { I18N } from '../constants';
import * as planService from '../services/planService';
import { optimizePlan, PlanOptimizerRequest } from '../services/planOptimizerService';
import { X, Save, Loader, Trash2, Plus, Sparkles, Info } from './icons';

interface PlanOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivar: Cultivar;
  substrate: Substrate;
  basePlan: ManagedPlan;
  lang: Language;
  t: (key: string) => string;
  onPlanApplied: () => void;
}

type WeekFormEntry = {
  id: string;
  phase: string;
  stage: PlanOptimizerStage;
  targets: Partial<Record<NutrientKey, string>>;
};

const ALL_NUTRIENTS: NutrientKey[] = ['N', 'P', 'K', 'Ca', 'Mg', 'S', 'Na', 'Fe', 'B', 'Mo', 'Mn', 'Zn', 'Cu', 'Cl'];
const DEFAULT_TARGETS: NutrientKey[] = ['N', 'P', 'K', 'Ca', 'Mg', 'S'];
const WATER_KEYS: NutrientKey[] = ['N', 'Ca', 'Mg', 'K', 'Na', 'S', 'Cl', 'Fe', 'Mn'];

const STAGE_OPTIONS: { value: PlanOptimizerStage; labelKey: string }[] = [
  { value: 'veg', labelKey: 'optimizer_stage_veg' },
  { value: 'flower', labelKey: 'optimizer_stage_flower' },
  { value: 'ripen', labelKey: 'optimizer_stage_ripen' },
];

const determineStage = (phase: string): PlanOptimizerStage => {
  const weekNumber = getWeekNumber(phase as Phase);
  if (weekNumber === null) return 'veg';
  if (weekNumber >= 9) return 'ripen';
  return 'flower';
};

const cloneWaterProfile = (profile: NutrientProfile | undefined): Partial<Record<NutrientKey, number>> => {
  const next: Partial<Record<NutrientKey, number>> = {};
  if (!profile) return next;
  for (const key of ALL_NUTRIENTS) {
    const value = profile[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next;
};

const PlanOptimizerModal: React.FC<PlanOptimizerModalProps> = ({
  isOpen,
  onClose,
  cultivar,
  substrate,
  basePlan,
  lang,
  t,
  onPlanApplied,
}) => {
  const translation = I18N[lang] as Record<string, any>;
  const nutrientLabels: Record<string, string> = translation?.nutrient_labels || {};
  const waterLabels: Record<string, string> = translation?.water_labels || {};

  const initialWeeks = useMemo<WeekFormEntry[]>(() => {
    if (!basePlan.plan.length) {
      return [
        {
          id: generateClientId('opt-week'),
          phase: 'W1',
          stage: 'flower',
          targets: {},
        },
      ];
    }
    return basePlan.plan.map(entry => ({
      id: generateClientId('opt-week'),
      phase: entry.phase,
      stage: determineStage(entry.phase),
      targets: {},
    }));
  }, [basePlan.plan]);

  const initialWater = useMemo(() => cloneWaterProfile(basePlan.waterProfile), [basePlan.waterProfile]);
  const initialOsmosis = useMemo(() => {
    const share = typeof basePlan.osmosisShare === 'number' ? basePlan.osmosisShare : 0;
    return Math.min(100, Math.max(0, share * 100));
  }, [basePlan.osmosisShare]);

  const [weeks, setWeeks] = useState<WeekFormEntry[]>(initialWeeks);
  const [selectedNutrients, setSelectedNutrients] = useState<NutrientKey[]>(DEFAULT_TARGETS);
  const [waterProfile, setWaterProfile] = useState<Partial<Record<NutrientKey, number>>>(initialWater);
  const [osmosisShare, setOsmosisShare] = useState<string>(initialOsmosis.toFixed(1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanOptimizationResponse | null>(null);
  const [planName, setPlanName] = useState<string>('');
  const [planDescription, setPlanDescription] = useState<string>('');
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [lastRequestWeeks, setLastRequestWeeks] = useState<PlanOptimizerWeekInput[] | null>(null);

  const resetState = useCallback(() => {
    setWeeks(initialWeeks);
    setSelectedNutrients(DEFAULT_TARGETS);
    setWaterProfile(initialWater);
    setOsmosisShare(initialOsmosis.toFixed(1));
    setIsSubmitting(false);
    setError(null);
    setResult(null);
    setPlanName(t('optimizer_default_plan_name'));
    setPlanDescription('');
    setDescriptionDirty(false);
    setLastRequestWeeks(null);
  }, [initialWeeks, initialWater, initialOsmosis, t]);

  useEffect(() => {
    if (isOpen) resetState();
  }, [isOpen, resetState]);

  useEffect(() => {
    if (!descriptionDirty && result?.summary) setPlanDescription(result.summary);
  }, [result, descriptionDirty]);

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const toggleNutrient = (key: NutrientKey) => {
    setSelectedNutrients(prev => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return ALL_NUTRIENTS.filter(item => set.has(item));
    });
  };

  const updateWeek = (id: string, updater: (week: WeekFormEntry) => WeekFormEntry) => {
    setWeeks(prev => prev.map(week => (week.id === id ? updater({ ...week }) : week)));
  };

  const handlePhaseChange = (id: string, value: string) => {
    updateWeek(id, week => ({ ...week, phase: value }));
  };

  const handleStageChange = (id: string, value: PlanOptimizerStage) => {
    updateWeek(id, week => ({ ...week, stage: value }));
  };

  const handleTargetChange = (id: string, key: NutrientKey, value: string) => {
    updateWeek(id, week => {
      const nextTargets = { ...week.targets };
      nextTargets[key] = value;
      return { ...week, targets: nextTargets };
    });
  };

  const handleWaterProfileChange = (key: NutrientKey, value: string) => {
    const trimmed = value.trim();
    setWaterProfile(prev => {
      const next = { ...prev };
      if (trimmed === '') {
        delete next[key];
      } else {
        const numeric = Number(trimmed.replace(',', '.'));
        if (Number.isNaN(numeric)) {
          delete next[key];
        } else {
          next[key] = numeric;
        }
      }
      return next;
    });
  };

  const addWeek = () => {
    const highestWeek = weeks.reduce((max, week) => {
      const num = getWeekNumber(week.phase as Phase);
      return num !== null ? Math.max(max, num) : max;
    }, 0);
    const defaultPhase = highestWeek > 0 ? `W${highestWeek + 1}` : `W${weeks.length + 1}`;
    const lastStage = weeks.length ? weeks[weeks.length - 1].stage : 'flower';
    setWeeks(prev => [
      ...prev,
      {
        id: generateClientId('opt-week'),
        phase: defaultPhase,
        stage: lastStage,
        targets: {},
      },
    ]);
  };

  const removeWeek = (id: string) => {
    setWeeks(prev => prev.filter(week => week.id !== id));
  };

  const parseTargetsForRequest = (week: WeekFormEntry): NutrientTargets => {
    const out: NutrientTargets = {};
    for (const nutrient of selectedNutrients) {
      const raw = week.targets[nutrient];
      if (raw === undefined) continue;
      const numeric = Number(String(raw).trim().replace(',', '.'));
      if (!Number.isFinite(numeric) || numeric < 0) continue;
      out[nutrient] = numeric;
    }
    return out;
  };

  const sanitizeWaterProfile = (): NutrientProfile => {
    const profile: NutrientProfile = {};
    for (const key of ALL_NUTRIENTS) {
      const value = waterProfile[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) profile[key] = value;
    }
    return profile;
  };

  const parseOsmosisShare = (): number => {
    const numeric = Number(osmosisShare.replace(',', '.'));
    if (!Number.isFinite(numeric)) return 0;
    const clamped = Math.min(100, Math.max(0, numeric));
    return clamped / 100;
  };

  const targetLookup = useMemo(() => {
    if (!lastRequestWeeks) return {} as Record<string, NutrientTargets>;
    const map: Record<string, NutrientTargets> = {};
    for (const week of lastRequestWeeks) map[week.phase] = week.targets;
    return map;
  }, [lastRequestWeeks]);

  const handleOptimize = async () => {
    setError(null);
    if (!weeks.length) {
      setError(t('optimizer_error_no_weeks'));
      return;
    }
    if (!selectedNutrients.length) {
      setError(t('optimizer_error_no_nutrients'));
      return;
    }

    const preparedWeeks: PlanOptimizerWeekInput[] = [];
    for (const week of weeks) {
      const phase = week.phase.trim();
      if (!phase) {
        setError(t('optimizer_error_missing_phase'));
        return;
      }
      const targets = parseTargetsForRequest(week);
      if (!Object.keys(targets).length) {
        setError(t('optimizer_error_targets_missing').replace('{0}', phase));
        return;
      }
      preparedWeeks.push({ phase, stage: week.stage, targets });
    }

    const requestBody: PlanOptimizerRequest = {
      lang,
      cultivar,
      substrate,
      waterProfile: sanitizeWaterProfile(),
      osmosisShare: parseOsmosisShare(),
      weeks: preparedWeeks,
    };

    setIsSubmitting(true);
    try {
      const response = await optimizePlan(requestBody);
      if (!response.ok) {
        setResult(null);
        setLastRequestWeeks(null);
        setError(response.error.message);
        return;
        }
      setResult(response.data);
      setLastRequestWeeks(preparedWeeks);
      if (!planName.trim()) setPlanName(t('optimizer_default_plan_name'));
      setError(null);
    } catch (e: any) {
      setResult(null);
      setLastRequestWeeks(null);
      setError(e?.message || t('optimizer_error_generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePlan = () => {
    if (!result || !result.plan.length) {
      setError(t('optimizer_error_no_result'));
      return;
    }
    const trimmedName = planName.trim();
    if (!trimmedName) {
      setError(t('optimizer_error_name_required'));
      return;
    }

    const planEntries = result.plan.map((suggestion: PlanOptimizationSuggestion, index: number) => {
      const source = basePlan.plan[index];
      return {
        phase: suggestion.phase as Phase,
        A: Number.isFinite(suggestion.A) ? Number(suggestion.A) : 0,
        X: Number.isFinite(suggestion.X) ? Number(suggestion.X) : 0,
        BZ: Number.isFinite(suggestion.BZ) ? Number(suggestion.BZ) : 0,
        pH: suggestion.pH || source?.pH || '',
        EC: suggestion.EC || source?.EC || '',
        Tide: source?.Tide,
        Helix: source?.Helix,
        Ligand: source?.Ligand,
        Silicate: source?.Silicate,
        SilicateUnit: source?.SilicateUnit,
        durationDays: source?.durationDays ?? 7,
        notes: source?.notes ? [...source.notes] : undefined,
      };
    });

    const planPayload = {
      name: trimmedName,
      description: planDescription.trim(),
      plan: planEntries,
      waterProfile: sanitizeWaterProfile(),
      osmosisShare: parseOsmosisShare(),
    };

    let savedPlanId: string;

    if (basePlan.id === 'default' && planService.isDefaultPlanEditable(cultivar)) {
      const overridePlan: ManagedPlan = { id: 'default', ...planPayload };
      planService.savePlan(cultivar, substrate, overridePlan);
      savedPlanId = 'default';
    } else if (basePlan.id !== 'default') {
      const updatedPlan: ManagedPlan = { id: basePlan.id, ...planPayload };
      planService.savePlan(cultivar, substrate, updatedPlan);
      savedPlanId = basePlan.id;
    } else {
      const createdPlan = planService.createPlan(cultivar, substrate, planPayload);
      savedPlanId = createdPlan.id;
    }

    planService.setActivePlanId(cultivar, substrate, savedPlanId);
    onPlanApplied();
    onClose();
  };

  const alignmentText = (suggestion: PlanOptimizationSuggestion): string[] => {
    const targets = targetLookup[suggestion.phase] || {};
    return selectedNutrients
      .map(key => {
        const label = nutrientLabels[key] || key;
        const target = targets[key];
        const achieved = suggestion.achieved?.[key];
        const diff = suggestion.diff?.[key];
        if (target === undefined && achieved === undefined && diff === undefined) return undefined;
        const parts: string[] = [];
        if (target !== undefined) parts.push(`${t('optimizer_target_short')} ${target.toFixed(1)}`);
        if (achieved !== undefined) parts.push(`${t('optimizer_actual_short')} ${achieved.toFixed(1)}`);
        if (diff !== undefined) {
          const sign = diff > 0 ? '+' : '';
          parts.push(`${t('optimizer_diff_short')} ${sign}${diff.toFixed(1)}`);
        }
        return `${label}: ${parts.join(' · ')}`;
      })
      .filter((entry): entry is string => Boolean(entry));
  };

  const renderAlignment = (suggestion: PlanOptimizationSuggestion) => {
    const rows = alignmentText(suggestion);
    if (!rows.length) return <span className="text-muted">{t('optimizer_alignment_missing')}</span>;
    return (
      <ul className="space-y-1 text-xs text-text">
        {rows.map(text => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-6xl max-h-[92vh] bg-card border border-border rounded-xl flex flex-col"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex justify-between items-center p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-brand-b/20">
              <Sparkles className="w-5 h-5 text-brand-b" />
            </div>
            <h3 className="text-xl font-bold text-text-strong">{t('optimizer_modal_title')}</h3>
          </div>
          <button onClick={handleClose} className="text-muted hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="overflow-y-auto p-4 flex-grow space-y-6">
          <div className="bg-black/20 border border-border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-brand-b/20 rounded-full">
                <Info className="w-5 h-5 text-brand-b" />
              </div>
              <p className="text-sm text-muted leading-relaxed">{t('optimizer_intro')}</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-200 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <section>
            <h4 className="text-sm font-semibold text-text-strong uppercase tracking-wide">{t('optimizer_nutrient_select_label')}</h4>
            <p className="text-xs text-muted mt-1">{t('optimizer_nutrient_select_hint')}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {ALL_NUTRIENTS.map(key => (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                    selectedNutrients.includes(key)
                      ? 'border-brand-b text-brand-b bg-brand-b/10'
                      : 'border-border text-muted hover:border-brand-b/50'
                  } cursor-pointer text-sm`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedNutrients.includes(key)}
                    onChange={() => toggleNutrient(key)}
                  />
                  <span>{nutrientLabels[key] || key}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="border border-border rounded-lg overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-black/20 text-text-strong">
                <tr>
                  <th className="px-3 py-2 text-left">{t('optimizer_phase_header')}</th>
                  <th className="px-3 py-2 text-left">{t('optimizer_stage_header')}</th>
                  {selectedNutrients.map(key => (
                    <th key={key} className="px-3 py-2 text-left">
                      {nutrientLabels[key] || key} ({t('optimizer_target_unit')})
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {weeks.map(week => (
                  <tr key={week.id} className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={week.phase}
                        onChange={event => handlePhaseChange(week.id, event.target.value)}
                        className="w-full bg-bg border border-border rounded-md px-2 py-1 text-text focus:outline-none focus:ring-2 focus:ring-brand-b"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={week.stage}
                        onChange={event => handleStageChange(week.id, event.target.value as PlanOptimizerStage)}
                        className="w-full bg-bg border border-border rounded-md px-2 py-1 text-text focus:outline-none focus:ring-2 focus:ring-brand-b"
                      >
                        {STAGE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                    {selectedNutrients.map(key => (
                      <td key={key} className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={week.targets[key] ?? ''}
                          onChange={event => handleTargetChange(week.id, key, event.target.value)}
                          className="w-full bg-bg border border-border rounded-md px-2 py-1 text-text focus:outline-none focus:ring-2 focus:ring-brand-b"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => removeWeek(week.id)}
                        className="text-muted hover:text-red-400"
                        aria-label={t('optimizer_remove_week')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-border bg-black/10 flex justify-between items-center">
              <span className="text-xs text-muted">{t('optimizer_targets_hint')}</span>
              <button type="button" onClick={addWeek} className="btn-secondary flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" />
                {t('optimizer_add_week')}
              </button>
            </div>
          </section>

          <section className="border border-border rounded-lg p-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-text-strong uppercase tracking-wide">{t('optimizer_water_section_title')}</h4>
              <p className="text-xs text-muted mt-1">{t('optimizer_water_section_hint')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {WATER_KEYS.map(key => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-text-strong">{waterLabels[key] || key}</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={waterProfile[key] ?? ''}
                    onChange={event => handleWaterProfileChange(key, event.target.value)}
                    className="w-full bg-bg border border-border rounded-md px-2 py-1 text-text focus:outline-none focus:ring-2 focus:ring-brand-b"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <label className="text-sm font-semibold text-text-strong">
                {t('optimizer_osmosis_label')}
                <span className="block text-xs text-muted font-normal">{t('optimizer_osmosis_hint')}</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={osmosisShare}
                onChange={event => setOsmosisShare(event.target.value)}
                className="w-full sm:w-40 bg-bg border border-border rounded-md px-2 py-1 text-text focus:outline-none focus:ring-2 focus:ring-brand-b"
              />
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleClose} className="btn-secondary">
              {t('optimizer_cancel_button')}
            </button>
            <button
              type="button"
              onClick={handleOptimize}
              className="btn-primary flex items-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
              {t('optimizer_run_button')}
            </button>
          </div>

          {result && (
            <section className="space-y-4">
              <div className="bg-brand-b/10 border border-brand-b/40 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-brand-b uppercase tracking-wide">{t('optimizer_result_summary_title')}</h4>
                <p className="text-sm text-text mt-2 whitespace-pre-line">
                  {result.summary ? result.summary : t('optimizer_result_no_summary')}
                </p>
              </div>

              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-black/20 text-text-strong">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('optimizer_phase_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_a_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_x_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_bz_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_ph_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_ec_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_alignment_header')}</th>
                      <th className="px-3 py-2 text-left">{t('optimizer_notes_header')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.plan.map(suggestion => (
                      <tr key={suggestion.phase} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-text-strong">{suggestion.phase}</div>
                          {suggestion.stage && (
                            <div className="text-xs text-muted">
                              {t('optimizer_stage_label_short')} {suggestion.stage}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">{suggestion.A.toFixed(2)}</td>
                        <td className="px-3 py-2">{suggestion.X.toFixed(2)}</td>
                        <td className="px-3 py-2">{suggestion.BZ.toFixed(2)}</td>
                        <td className="px-3 py-2">{suggestion.pH || '–'}</td>
                        <td className="px-3 py-2">{suggestion.EC || '–'}</td>
                        <td className="px-3 py-2">{renderAlignment(suggestion)}</td>
                        <td className="px-3 py-2 text-xs text-muted whitespace-pre-line">
                          {suggestion.notes || '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-text-strong" htmlFor="optimizer-plan-name">
                    {t('optimizer_plan_name_label')}
                  </label>
                  <input
                    id="optimizer-plan-name"
                    type="text"
                    value={planName}
                    onChange={event => setPlanName(event.target.value)}
                    placeholder={t('optimizer_plan_name_placeholder')}
                    className="w-full bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-brand-b"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-text-strong" htmlFor="optimizer-plan-description">
                    {t('optimizer_plan_description_label')}
                  </label>
                  <textarea
                    id="optimizer-plan-description"
                    rows={2}
                    value={planDescription}
                    onChange={event => {
                      setPlanDescription(event.target.value);
                      setDescriptionDirty(true);
                    }}
                    placeholder={t('optimizer_plan_description_placeholder')}
                    className="w-full bg-bg border border-border rounded-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-brand-b resize-y"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={handleSavePlan} className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {t('optimizer_save_plan_button')}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanOptimizerModal;
