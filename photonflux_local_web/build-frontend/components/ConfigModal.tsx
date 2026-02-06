// FIX: Import `useCallback` from `react` to resolve the 'Cannot find name' error.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Plan, PlanEntry, Phase, Cultivar, Substrate, ManagedPlan, NutrientProfile, Language } from '../types';
import * as planService from '../services/planService';
import { X, Save, Upload, Download, Trash2, CheckCircle, Info } from './icons';
import Tooltip from './Tooltip';
import { I18N, CULTIVARS, SUBSTRATES } from '../constants';
import { getWeekNumber } from '../utils';

const WATER_KEYS: (keyof NutrientProfile)[] = ['N', 'Ca', 'Mg', 'K', 'Na', 'S', 'Cl', 'Fe', 'Mn'];

const MIN_FLOWERING_WEEKS = 1;


interface ConfigModalProps {
  cultivar: Cultivar;
  substrate: Substrate;
  onClose: () => void;
  onPlanConfigurationChange: () => void;
  t: (key: string) => string;
  weekTag: (phase: Phase) => string;
  lang: Language;
  onCultivarChange: (cultivar: Cultivar) => void;
}

type NewPlanDetails = { name: string; description: string; cultivar: Cultivar; substrate: Substrate };

const ConfigModal: React.FC<ConfigModalProps> = ({ cultivar, substrate, onClose, onPlanConfigurationChange, t, weekTag, lang, onCultivarChange }) => {
  const defaultPlanForCombo = useMemo(() => planService.getDefaultPlan(cultivar, substrate), [cultivar, substrate]);
  const [availablePlans, setAvailablePlans] = useState<ManagedPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>('default');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('default');
  const [editablePlan, setEditablePlan] = useState<Plan>([]);
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [editableWaterProfile, setEditableWaterProfile] = useState<NutrientProfile>({ ...defaultPlanForCombo.waterProfile });
  const [editableOsmosisShare, setEditableOsmosisShare] = useState<number>(defaultPlanForCombo.osmosisShare);

  // New state for "Save As" flow
  const [isSavingAs, setIsSavingAs] = useState(false);
  const [newPlanDetails, setNewPlanDetails] = useState<NewPlanDetails>({
    name: '',
    description: '',
    cultivar,
    substrate,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEditDefaultPlan = planService.isDefaultPlanEditable(cultivar);
  const isReadOnly = selectedPlanId === 'default' && !canEditDefaultPlan;
  const currentSelectedPlan = availablePlans.find(p => p.id === selectedPlanId);
  const translation = I18N[lang] as Record<string, any>;
  const waterLabels: Record<string, string> = translation?.water_labels || {};
  const cultivarLabels: Record<string, string> = translation?.cultivar_names || {};
  const substrateLabels: Record<string, string> = translation?.substrate_names || {};
  const getCultivarLabel = useCallback(
    (id: Cultivar): string =>
      cultivarLabels[id] ?? id.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    [cultivarLabels],
  );

  const currentWeekCount = useMemo(() => {
    if (!Array.isArray(editablePlan)) return 0;
    return editablePlan.filter(entry => entry && getWeekNumber(entry.phase) !== null).length;
  }, [editablePlan]);

  const adjustWeekCount = useCallback((desiredCount: number) => {
    if (isReadOnly) return;
    const normalizedCount = Math.max(MIN_FLOWERING_WEEKS, desiredCount);
    setEditablePlan(prevPlan => {
      const vegEntries = prevPlan.filter(entry => getWeekNumber(entry.phase) === null).map(entry => ({ ...entry }));
      const floweringEntries = prevPlan
        .filter(entry => getWeekNumber(entry.phase) !== null)
        .sort((a, b) => {
          const aWeek = getWeekNumber(a.phase) ?? 0;
          const bWeek = getWeekNumber(b.phase) ?? 0;
          return aWeek - bWeek;
        });

      const existingCount = floweringEntries.length;
      const templateSource = existingCount > 0 ? floweringEntries[existingCount - 1] : undefined;

      const createWeekEntry = (source: PlanEntry | undefined, weekIndex: number): PlanEntry => ({
        phase: `W${weekIndex}` as Phase,
        A: source?.A ?? 0,
        X: source?.X ?? 0,
        BZ: source?.BZ ?? 0,
        pH: source?.pH ?? '',
        EC: source?.EC ?? '',
        Tide: source?.Tide,
        Helix: source?.Helix,
        Ligand: source?.Ligand,
        Silicate: source?.Silicate,
        SilicateUnit: source?.SilicateUnit,
        durationDays: source?.durationDays ?? 7,
        notes: source?.notes ? [...source.notes] : undefined,
      });

      const nextFlowering: PlanEntry[] = [];
      const keepCount = Math.min(normalizedCount, existingCount);
      for (let i = 0; i < keepCount; i++) {
        nextFlowering.push(createWeekEntry(floweringEntries[i], i + 1));
      }
      for (let i = existingCount; i < normalizedCount; i++) {
        nextFlowering.push(createWeekEntry(templateSource, i + 1));
      }

      return [...vegEntries, ...nextFlowering];
    });
  }, [isReadOnly]);

  const handleIncreaseWeek = useCallback(() => {
    adjustWeekCount(currentWeekCount + 1);
  }, [adjustWeekCount, currentWeekCount]);

  const handleDecreaseWeek = useCallback(() => {
    if (currentWeekCount <= MIN_FLOWERING_WEEKS) return;
    adjustWeekCount(currentWeekCount - 1);
  }, [adjustWeekCount, currentWeekCount]);

  const handleWeekCountInput = useCallback((value: string) => {
    if (isReadOnly) return;
    const numericValue = Number.parseInt(value, 10);
    if (Number.isNaN(numericValue)) return;
    adjustWeekCount(numericValue);
  }, [adjustWeekCount, isReadOnly]);

  const loadPlans = useCallback(() => {
    const plans = planService.getAvailablePlans(cultivar, substrate);
    const activeId = planService.getActivePlanId(cultivar, substrate);
    setAvailablePlans(plans);
    setActivePlanId(activeId);
    setSelectedPlanId(activeId);
  }, [cultivar, substrate]);

  useEffect(() => {
    loadPlans();
  }, [cultivar, substrate, loadPlans]);

  useEffect(() => {
    const unsubscribe = planService.subscribe(loadPlans);
    return () => unsubscribe();
  }, [loadPlans]);

  useEffect(() => {
    if (isSavingAs) return; // Don't reset the form while in "Save As" mode
    const plan = availablePlans.find(p => p.id === selectedPlanId);
    if (plan) {
      setEditablePlan(JSON.parse(JSON.stringify(plan.plan)));
      setPlanName(plan.name);
      setPlanDescription(plan.description || '');
      setEditableWaterProfile({ ...(plan.waterProfile || defaultPlanForCombo.waterProfile) });
      setEditableOsmosisShare(typeof plan.osmosisShare === 'number' ? plan.osmosisShare : defaultPlanForCombo.osmosisShare);
    }
  }, [selectedPlanId, availablePlans, isSavingAs, defaultPlanForCombo]);

  const numericKeys = new Set<keyof PlanEntry>(['A', 'X', 'BZ', 'Tide', 'Helix', 'Ligand', 'Silicate', 'durationDays']);

  const handleInputChange = (index: number, key: keyof PlanEntry, value: string | number) => {
    const newPlan = [...editablePlan];
    const entry = newPlan[index];
    if (entry) {
      if (numericKeys.has(key)) {
        const numericValue = Number(value);
        (entry[key] as any) = Number.isNaN(numericValue) ? 0 : numericValue;
      } else {
        (entry[key] as any) = value;
      }
      setEditablePlan(newPlan);
    }
  };

  const handleWaterProfileChange = (key: keyof NutrientProfile, value: string) => {
    const numericValue = Number(value);
    setEditableWaterProfile(prev => ({
      ...prev,
      [key]: Number.isNaN(numericValue) ? 0 : numericValue,
    }));
  };

  const handleOsmosisShareChange = (value: string) => {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      setEditableOsmosisShare(0);
      return;
    }
    const clampedPercent = Math.min(100, Math.max(0, numericValue));
    setEditableOsmosisShare(clampedPercent / 100);
  };
  
  const handleSave = () => {
    if (isReadOnly) return;
    const planToSave: ManagedPlan = {
      id: selectedPlanId,
      name: planName,
      description: planDescription,
      plan: editablePlan,
      waterProfile: editableWaterProfile,
      osmosisShare: editableOsmosisShare,
    };
    planService.savePlan(cultivar, substrate, planToSave);
    loadPlans(); 
    onPlanConfigurationChange();
  };
  
  const handleInitiateSaveAs = () => {
    setNewPlanDetails({
      name: `Copy of ${planName}`,
      description: planDescription,
      cultivar,
      substrate,
    });
    setIsSavingAs(true);
  };

  const handleConfirmSaveAs = () => {
    const trimmedName = newPlanDetails.name.trim();
    if (!trimmedName) {
      alert(t('plan_create_missing_name'));
      return;
    }

    const targetCultivar = newPlanDetails.cultivar;
    const targetSubstrate = newPlanDetails.substrate;

    const createdPlan = planService.createPlan(targetCultivar, targetSubstrate, {
      name: trimmedName,
      description: newPlanDetails.description.trim(),
      plan: editablePlan,
      waterProfile: editableWaterProfile,
      osmosisShare: editableOsmosisShare,
    });
    planService.setActivePlanId(targetCultivar, targetSubstrate, createdPlan.id);

    onPlanConfigurationChange();
    setIsSavingAs(false);
    loadPlans();

    if (targetCultivar === cultivar && targetSubstrate === substrate) {
      setSelectedPlanId(createdPlan.id);
    }
  };

  const handleDelete = () => {
    if (isReadOnly) return;
    if (window.confirm(t('plan_confirm_delete'))) {
      planService.deletePlan(cultivar, substrate, selectedPlanId);
      planService.setActivePlanId(cultivar, substrate, 'default');
      loadPlans();
      onPlanConfigurationChange();
    }
  };

  const handleSetActive = () => {
    planService.setActivePlanId(cultivar, substrate, selectedPlanId);
    setActivePlanId(selectedPlanId);
    onPlanConfigurationChange();
  };
  
  const handleExport = () => {
      const planToExport = availablePlans.find(p => p.id === selectedPlanId);
      if (!planToExport) return;
      const exportPayload = {
          name: planToExport.name,
          description: planToExport.description,
          plan: planToExport.plan,
          waterProfile: planToExport.waterProfile,
          osmosisShare: planToExport.osmosisShare,
      };
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `plan-${planToExport.name.replace(/\s/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedPlanData = JSON.parse(text);
        let planEntries: Plan | null = null;
        let importedWaterProfile: NutrientProfile = { ...defaultPlanForCombo.waterProfile };
        let importedOsmosisShare: number = defaultPlanForCombo.osmosisShare;
        let importedName = file.name.replace('.json', '') || 'Imported Plan';
        let importedDescription = `Imported on ${new Date().toLocaleDateString()}`;

        if (Array.isArray(importedPlanData)) {
            planEntries = importedPlanData as Plan;
        } else if (importedPlanData && typeof importedPlanData === 'object') {
            if (Array.isArray(importedPlanData.plan)) {
                planEntries = importedPlanData.plan as Plan;
            }
            if (importedPlanData.waterProfile) {
                importedWaterProfile = { ...importedWaterProfile, ...importedPlanData.waterProfile };
            }
            if (typeof importedPlanData.osmosisShare === 'number') {
                importedOsmosisShare = Math.min(1, Math.max(0, importedPlanData.osmosisShare));
            }
            if (typeof importedPlanData.name === 'string') {
                importedName = importedPlanData.name;
            }
            if (typeof importedPlanData.description === 'string') {
                importedDescription = importedPlanData.description;
            }
        }

        if(planEntries && planEntries.length) {
            const createdPlan = planService.createPlan(cultivar, substrate, {
                name: importedName,
                description: importedDescription,
                plan: planEntries,
                waterProfile: importedWaterProfile,
                osmosisShare: importedOsmosisShare,
            });
            alert(t('plan_import_success').replace('{0}', importedName));
            loadPlans();
            setSelectedPlanId(createdPlan.id);
        } else {
          alert(t('plan_import_fail'));
        }
      } catch (e) {
        alert(t('plan_import_fail'));
        console.error(e);
      }
      if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const inputCellClasses = "w-24 bg-bg text-text-strong font-semibold border border-border rounded-md px-2 py-1 text-center focus:ring-2 focus:ring-brand-b focus:outline-none read-only:bg-card read-only:text-muted read-only:cursor-not-allowed";
  const textInputClasses = "w-full bg-bg text-text border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none read-only:bg-card read-only:text-muted read-only:cursor-not-allowed";
  const waterInputClasses = "w-full bg-bg text-text border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none read-only:bg-card read-only:text-muted read-only:cursor-not-allowed";
  const weekCountInputClasses = "w-20 bg-bg text-text border border-border rounded-lg px-3 py-2 text-center focus:ring-2 focus:ring-brand-b focus:outline-none read-only:bg-card read-only:text-muted read-only:cursor-not-allowed";


  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[90vh] bg-card border border-border rounded-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex justify-between items-center p-4 border-b border-border">
          <h3 className="text-xl font-bold text-text-strong">{t('plan_manager_title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="p-4 border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-wrap gap-4">
                    <div>
                        <label htmlFor="plan-select" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_select_label')}</label>
                        <select id="plan-select" value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} disabled={isSavingAs} className="w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none disabled:opacity-50">
                            {availablePlans.map(p => (
                                <option key={p.id} value={p.id}>{p.name}{p.id === 'default' ? ` (${t('plan_default')})` : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="cultivar-select" className="block text-sm font-semibold text-text-strong mb-1">{t('cultivar')}</label>
                        <select
                            id="cultivar-select"
                            value={cultivar}
                            onChange={(e) => onCultivarChange(e.target.value as Cultivar)}
                            className="w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none"
                        >
                            {CULTIVARS.map(option => (
                                <option key={option} value={option}>
                                    {getCultivarLabel(option)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-2 pt-7 flex-wrap">
                    {selectedPlanId === activePlanId && !isSavingAs ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-full whitespace-nowrap"><CheckCircle className="w-4 h-4"/>{t('plan_active_badge')}</span>
                    ) : (
                        <button onClick={handleSetActive} disabled={isSavingAs} className="btn-secondary whitespace-nowrap disabled:opacity-50">{t('plan_set_active_button')}</button>
                    )}
                </div>
            </div>
             {currentSelectedPlan && !isSavingAs && (
                <div className="mt-3 p-3 bg-black/20 rounded-md border border-border/50">
                    <p className="text-sm text-muted">
                        {currentSelectedPlan.description || t('plan_no_description')}
                    </p>
                </div>
            )}
        </div>

        <div className="overflow-y-auto p-4 flex-grow">
          {isSavingAs ? (
              <div className="p-4 mb-4 bg-blue-900/30 border border-blue-600/50 rounded-lg">
                  <h4 className="text-lg font-bold text-blue-200 mb-3">{t('plan_create_new_title')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label htmlFor="new-plan-name" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_name_label')}</label>
                          <input
                            id="new-plan-name"
                            type="text"
                            value={newPlanDetails.name}
                            onChange={e => setNewPlanDetails(p => ({ ...p, name: e.target.value }))}
                            placeholder={t('plan_name_placeholder')}
                            className={textInputClasses}
                          />
                      </div>
                      <div>
                          <label htmlFor="new-plan-description" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_description_label')}</label>
                          <textarea
                            id="new-plan-description"
                            rows={1}
                            value={newPlanDetails.description}
                            onChange={e => setNewPlanDetails(p => ({ ...p, description: e.target.value }))}
                            placeholder={t('plan_description_placeholder')}
                            className={`${textInputClasses} resize-y min-h-[42px]`}
                          />
                      </div>
                      <div>
                          <label htmlFor="new-plan-cultivar" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_create_cultivar_label')}</label>
                          <select
                            id="new-plan-cultivar"
                            value={newPlanDetails.cultivar}
                            onChange={e => setNewPlanDetails(p => ({ ...p, cultivar: e.target.value as Cultivar }))}
                            className={textInputClasses}
                          >
                            {CULTIVARS.map(option => (
                              <option key={option} value={option}>
                                {getCultivarLabel(option)}
                              </option>
                            ))}
                          </select>
                      </div>
                      <div>
                          <label htmlFor="new-plan-substrate" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_create_substrate_label')}</label>
                          <select
                            id="new-plan-substrate"
                            value={newPlanDetails.substrate}
                            onChange={e => setNewPlanDetails(p => ({ ...p, substrate: e.target.value as Substrate }))}
                            className={textInputClasses}
                          >
                            {SUBSTRATES.map(option => (
                              <option key={option} value={option}>
                                {substrateLabels[option] || option}
                              </option>
                            ))}
                          </select>
                      </div>
                  </div>
                  <p className="text-xs text-blue-100/80 mt-3">{t('plan_create_target_hint')}</p>
              </div>
          ) : (
            isReadOnly ? (
              <div className="mb-4 p-3 bg-blue-900/50 border border-blue-500/50 rounded-md text-sm text-blue-200 flex items-center gap-2">
                  <Info className="w-5 h-5 flex-shrink-0" />
                  <span>{t('plan_default_is_readonly')}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                      <label htmlFor="plan-name" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_name_label')}</label>
                      <input id="plan-name" type="text" value={planName} onChange={e => setPlanName(e.target.value)} placeholder={t('plan_name_placeholder')} className={textInputClasses} />
                  </div>
                  <div>
                      <label htmlFor="plan-description" className="block text-sm font-semibold text-text-strong mb-1">{t('plan_description_label')}</label>
                      <textarea id="plan-description" rows={1} value={planDescription} onChange={e => setPlanDescription(e.target.value)} placeholder={t('plan_description_placeholder')} className={`${textInputClasses} resize-y min-h-[42px]`} />
                  </div>
              </div>
          )
        )}

          <div className="mt-4 p-4 bg-black/20 border border-border rounded-lg">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-text-strong uppercase tracking-wide">{t('water_profile_title')}</h4>
                <p className="text-xs text-muted mt-1">{t('water_profile_description')}</p>
              </div>
              <div className="w-full max-w-xs">
                <label className="block text-xs font-semibold text-text-strong mb-1">{t('water_osmosis_label')}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={Number((editableOsmosisShare * 100).toFixed(1))}
                  onChange={e => handleOsmosisShareChange(e.target.value)}
                  className={waterInputClasses}
                  readOnly={isReadOnly}
                />
                <p className="text-[11px] text-muted mt-1">{t('water_osmosis_hint')}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {WATER_KEYS.map((key) => {
                const value = Number(editableWaterProfile[key] ?? 0);
                const label = waterLabels[key as string] || key;
                return (
                  <div key={key as string} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-strong">{label}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number.isFinite(value) ? value : 0}
                      onChange={e => handleWaterProfileChange(key, e.target.value)}
                      className={waterInputClasses}
                      readOnly={isReadOnly}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="block text-sm font-semibold text-text-strong">{t('plan_week_count_label')}</label>
              <p className="text-xs text-muted mt-1">{t('plan_week_count_hint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDecreaseWeek}
                disabled={isReadOnly || currentWeekCount <= MIN_FLOWERING_WEEKS}
                className="btn-secondary px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('plan_week_remove')}
              >
                −
              </button>
              <input
                type="number"
                min={MIN_FLOWERING_WEEKS}
                value={Math.max(currentWeekCount, MIN_FLOWERING_WEEKS)}
                onChange={e => handleWeekCountInput(e.target.value)}
                className={weekCountInputClasses}
                readOnly={isReadOnly}
              />
              <button
                type="button"
                onClick={handleIncreaseWeek}
                disabled={isReadOnly}
                className="btn-secondary px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('plan_week_add')}
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="bg-black/20">
                  <th className="th-cell text-left">{t('phase')}</th>
                  <th className="th-cell">{t('plan_week_duration')}</th>
                  <th className="th-cell">A g/L</th>
                  <th className="th-cell">B/C g/L</th>
                  <th className="th-cell">Burst g/L</th>
                  <th className="th-cell">pH</th>
                  <th className="th-cell">EC</th>
                  <th className="th-cell">{t('note')}</th>
                </tr>
              </thead>
              <tbody>
                {editablePlan.map((p, i) => {
                  if (!p) return null;
                  return (
                  <tr key={i} className="border-b border-border last:border-b-0 hover:bg-white/5">
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap text-left">{p.phase}</td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap"><input type="number" min={1} step={1} value={Math.max(1, Math.round(p.durationDays ?? 7))} onChange={(e) => handleInputChange(i, 'durationDays', e.target.value)} className={inputCellClasses} /></td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap"><input type="number" step="0.01" value={p.A} onChange={(e) => handleInputChange(i, 'A', e.target.value)} className={inputCellClasses} /></td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap"><input type="number" step="0.01" value={p.X} onChange={(e) => handleInputChange(i, 'X', e.target.value)} className={inputCellClasses} /></td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap"><input type="number" step="0.01" value={p.BZ} onChange={(e) => handleInputChange(i, 'BZ', e.target.value)} className={inputCellClasses} /></td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap"><input type="text" value={p.pH} onChange={(e) => handleInputChange(i, 'pH', e.target.value)} className={inputCellClasses} /></td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap"><input type="text" value={p.EC} onChange={(e) => handleInputChange(i, 'EC', e.target.value)} className={inputCellClasses} /></td>
                    <td className="border-x-0 border-y border-border px-3 py-2 text-sm whitespace-nowrap text-xs text-muted whitespace-pre-line">
                      {[p.phase ? weekTag(p.phase) : '', ...(p.notes?.map(note => t(note)) ?? [])]
                        .filter(Boolean)
                        .join('\n')}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="flex flex-wrap gap-2 justify-end p-4 border-t border-border mt-auto">
          {isSavingAs ? (
            <>
              <button onClick={() => setIsSavingAs(false)} className="btn-secondary">{t('cancel')}</button>
              <button onClick={handleConfirmSaveAs} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4"/>{t('plan_save_new_button')}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">{t('close')}</button>
              <Tooltip text={t('tooltip_import')}><button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex items-center gap-2"><Upload className="w-4 h-4"/>{t('import')}</button></Tooltip>
              <Tooltip text={t('tooltip_export')}><button onClick={handleExport} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4"/>{t('export')}</button></Tooltip>
              <button onClick={handleDelete} disabled={isReadOnly} className="btn-secondary flex items-center gap-2 text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"><Trash2 className="w-4 h-4"/>{t('plan_delete_button')}</button>
              <button onClick={handleInitiateSaveAs} className="btn-secondary">{t('plan_save_as_button')}</button>
              <button onClick={handleSave} disabled={isReadOnly} className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Save className="w-4 h-4"/>{t('save')}</button>
            </>
          )}
        </footer>
      </div>
       <input
        type="file"
        accept="application/json"
        ref={fileInputRef}
        onChange={handleImport}
        className="hidden"
      />
    </div>
  );
};

const style = document.createElement('style');
style.innerHTML = `
  .th-cell { border-bottom-width: 1px; border-top-width: 1px; border-color: #243251; padding: 0.5rem 0.75rem; font-size: 0.875rem; white-space: nowrap; font-weight: 600; color: #f8fafc; }
  /* Hide spinners on number inputs for a cleaner look */
  .input-cell::-webkit-outer-spin-button,
  .input-cell::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .input-cell[type=number] {
    -moz-appearance: textfield;
  }
`;
document.head.appendChild(style);

export default ConfigModal;