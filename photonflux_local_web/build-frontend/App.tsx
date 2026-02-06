import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { I18N, CULTIVARS } from './constants';
import { calculateDose, DoserInput, CalculationResult } from './services/doserService';
import * as planService from './services/planService';
import * as growService from './services/growService';
import type { Language, Cultivar, Substrate, Trend, Tipburn, Pale, CaMgDeficiency, Claw, PHDrift, Phase, WeekStartDay, ManagedPlan, Grow } from './types';
import Header from './components/Header';
import GrowList from './components/GrowList';
import MultiGrowComparison from './components/MultiGrowComparison';
import InputPanel from './components/InputPanel';
import ResultsPanel from './components/ResultsPanel';
import MixingInstructions from './components/MixingInstructions';
import ConfigModal from './components/ConfigModal';
import PlantAnalyzerModal from './components/PlantAnalyzerModal';
import WeeklyPlanPanel from './components/WeeklyPlanPanel';
import JournalModal from './components/JournalModal';
import PlanOptimizerModal from './components/PlanOptimizerModal';
import { Camera, BookOpen, Sparkles } from './components/icons';
import Tooltip from './components/Tooltip';
import PlanPrintout from './components/PlanPrintout';
import { getPhaseTag, sortPhases, computePlanSchedule, findScheduleIndexForDate } from './utils';
import ErrorToast, { ErrorToastConfig } from './components/ErrorToast';
import ErrorBoundary from './components/ErrorBoundary';

const BACKEND_COLLECTION = 'photonflux';
const BACKEND_APP_STATE_KEY = 'appState';
const DEFAULT_CULTIVAR = CULTIVARS[0];

const defaultInputs: DoserInput = {
  phase: 'Early Veg',
  reservoir: 100,
  substrate: 'coco',
  trend: 'neutral',
  tipburn: 'no',
  pale: 'no',
  caMgDeficiency: 'no',
  claw: 'no',
  phDrift: 'normal',
  startDate: '',
};


const App: React.FC = () => {
  const getDefaultState = () => ({
    lang: 'de' as Language,
    cultivar: DEFAULT_CULTIVAR,
    inputs: { ...defaultInputs },
    autoPhaseEnabled: false,
    weekStartsOn: 1 as WeekStartDay,
  });

  const defaultState = useRef(getDefaultState()).current;

  const [lang, setLang] = useState<Language>(defaultState.lang);
  const [cultivar, setCultivar] = useState<Cultivar>(defaultState.cultivar);
  const [inputs, setInputs] = useState<DoserInput>(defaultState.inputs);
  const [autoPhaseEnabled, setAutoPhaseEnabled] = useState<boolean>(defaultState.autoPhaseEnabled);
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartDay>(defaultState.weekStartsOn);
  
  const [isGrowManagerOpen, setIsGrowManagerOpen] = useState(false);
  const [activeGrowForJournal, setActiveGrowForJournal] = useState<Grow | null>(null);
  const [comparisonGrows, setComparisonGrows] = useState<Grow[] | null>(null);

  const [currentPlan, setCurrentPlan] = useState<ManagedPlan>(() => planService.getDefaultPlan(DEFAULT_CULTIVAR, 'coco'));
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [isPlanOptimizerOpen, setIsPlanOptimizerOpen] = useState(false);
  const [errorToast, setErrorToast] = useState<ErrorToastConfig | null>(null);

  const showErrorToast = useCallback(
    (config: ErrorToastConfig) => {
      setErrorToast({
        ...config,
        title: config.title ?? (lang === 'de' ? 'Fehler' : 'Error'),
        retryLabel:
          config.onRetry && !config.retryLabel
            ? lang === 'de'
              ? 'Erneut versuchen'
              : 'Retry'
            : config.retryLabel,
      });
    },
    [lang]
  );

  const handleInputChange = useCallback(<K extends keyof DoserInput>(key: K, value: DoserInput[K]) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const hydrationCompleteRef = useRef(false);
  const skipNextPersistenceRef = useRef(false);

  const persistAppState = useCallback((state: {
    lang: Language;
    cultivar: Cultivar;
    inputs: DoserInput;
    autoPhaseEnabled: boolean;
    weekStartsOn: WeekStartDay;
  }) => {
    void (async () => {
      try {
        await fetch(`api/store/${BACKEND_COLLECTION}/${BACKEND_APP_STATE_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: state }),
        });
      } catch (error) {
        console.error('Failed to persist app state', error);
      }
    })();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const hydrate = async () => {
      try {
        const res = await fetch(`api/store/${BACKEND_COLLECTION}/${BACKEND_APP_STATE_KEY}`);
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.data ?? null;
        if (!isMounted || !data || typeof data !== 'object') return;

        const nextLang = (data.lang === 'en' || data.lang === 'de') ? (data.lang as Language) : defaultState.lang;
        const nextCultivar = CULTIVARS.includes(data.cultivar as Cultivar)
          ? (data.cultivar as Cultivar)
          : defaultState.cultivar;
        const nextInputs: DoserInput = { ...defaultInputs, ...(data.inputs ?? {}) };
        const rawWeekStart = Number(data.weekStartsOn);
        const nextWeekStart = (Number.isInteger(rawWeekStart) && rawWeekStart >= 0 && rawWeekStart <= 6
          ? rawWeekStart
          : defaultState.weekStartsOn) as WeekStartDay;
        const nextAutoPhaseEnabled = data.autoPhaseEnabled === true;

        setLang(nextLang);
        setCultivar(nextCultivar);
        setInputs(nextInputs);
        setAutoPhaseEnabled(nextAutoPhaseEnabled);
        setWeekStartsOn(nextWeekStart);
      } catch (error) {
        console.error('Failed to hydrate app state', error);
      } finally {
        hydrationCompleteRef.current = true;
        skipNextPersistenceRef.current = true;
      }
    };

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [defaultState]);

  useEffect(() => {
    if (!hydrationCompleteRef.current) return;
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }
    persistAppState({ lang, cultivar, inputs, autoPhaseEnabled, weekStartsOn });
  }, [lang, cultivar, inputs, autoPhaseEnabled, weekStartsOn, persistAppState]);

  const t = useCallback((key: string): string => {
    const translation = I18N[lang] as Record<string, any>;
    const keys = key.split('.');
    let result = translation;
    for (const k of keys) {
        if (result && typeof result === 'object' && k in result) {
            result = result[k];
        } else {
            return key;
        }
    }
    return typeof result === 'string' ? result : key;
  }, [lang]);

  const defaultPhaseOrder = useMemo<Phase[]>(() => sortPhases(Object.keys(I18N.de.phases) as Phase[]), []);

  const availablePhases = useMemo<Phase[]>(() => {
    const planPhases = currentPlan.plan.map(entry => entry.phase);
    return sortPhases([...defaultPhaseOrder, ...planPhases]);
  }, [currentPlan.plan, defaultPhaseOrder]);

  const weekTag = useCallback((phase: Phase): string => getPhaseTag(phase, lang), [lang]);

  const loadPlan = useCallback(() => {
    const activePlan = planService.getActivePlan(cultivar, inputs.substrate);
    setCurrentPlan(activePlan);
  }, [cultivar, inputs.substrate]);

  useEffect(() => {
    loadPlan();
  }, [cultivar, inputs.substrate, loadPlan]);

  useEffect(() => {
    const unsubscribe = planService.subscribe(loadPlan);
    return () => unsubscribe();
  }, [loadPlan]);

  const planSchedule = useMemo(
    () => computePlanSchedule(currentPlan.plan, inputs.startDate ?? '', weekStartsOn),
    [currentPlan.plan, inputs.startDate, weekStartsOn],
  );

  // Effect for automatic phase switching
  useEffect(() => {
    const checkCurrentPhase = () => {
      if (autoPhaseEnabled && inputs.startDate && planSchedule.length > 0) {
        const today = new Date();
        const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

        const index = findScheduleIndexForDate(planSchedule, todayUTC);
        if (index >= 0 && index < planSchedule.length) {
          const currentWeekPhase = planSchedule[index].phase;
          if (currentWeekPhase !== inputs.phase) {
            handleInputChange('phase', currentWeekPhase);
          }
        }
      }
    };

    checkCurrentPhase();
    const intervalId = setInterval(checkCurrentPhase, 1000 * 60 * 60);

    return () => clearInterval(intervalId);

  }, [autoPhaseEnabled, inputs.startDate, planSchedule, handleInputChange, inputs.phase]);


  const runCalculation = useCallback(() => {
    try {
      const result = calculateDose(inputs, currentPlan, t, weekTag);
      setResults(result);
    } catch (err) {
      console.error('Calculation failed:', err);
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === 'de'
          ? 'Die Berechnung konnte nicht abgeschlossen werden.'
          : 'Failed to complete the calculation.';
      showErrorToast({
        title: lang === 'de' ? 'Berechnungsfehler' : 'Calculation error',
        message,
        code: 'CALCULATION_FAILED',
        details,
        onRetry: () => runCalculation(),
        retryLabel: lang === 'de' ? 'Erneut berechnen' : 'Retry calculation',
      });
    }
  }, [inputs, currentPlan, t, weekTag, lang, showErrorToast]);

  useEffect(() => {
    runCalculation();
  }, [runCalculation]);


  const handleReset = () => {
    const resetState = {
      lang: defaultState.lang,
      cultivar: defaultState.cultivar,
      inputs: { ...defaultInputs },
      autoPhaseEnabled: defaultState.autoPhaseEnabled,
      weekStartsOn: defaultState.weekStartsOn,
    };
    setInputs(resetState.inputs);
    setLang(resetState.lang);
    setCultivar(resetState.cultivar);
    setAutoPhaseEnabled(resetState.autoPhaseEnabled);
    setWeekStartsOn(resetState.weekStartsOn);
    hydrationCompleteRef.current = true;
    skipNextPersistenceRef.current = true;
    persistAppState(resetState);
    planService.resetAllPlans(); // Also clear plan settings
    loadPlan();
  };

  const handleSelectGrowForJournal = (grow: Grow) => {
    setActiveGrowForJournal(grow);
    setIsJournalOpen(true);
    setIsGrowManagerOpen(false);
  };

  const handleCompareGrows = (growIds: string[]) => {
    const all = growService.getGrows();
    const selected = all.filter(g => growIds.includes(g.id));
    setComparisonGrows(selected);
  };

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="wrap max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Header
          lang={lang}
          setLang={setLang}
          cultivar={cultivar}
          setCultivar={setCultivar}
          onConfigClick={() => setIsModalOpen(true)}
          onPrintClick={() => window.print()}
          t={t}
        />

        <main className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6">
          <div className="xl:col-span-2 flex flex-col gap-4 sm:gap-6">
            <InputPanel
              inputs={inputs}
              onInputChange={handleInputChange}
              onCalculate={runCalculation}
              onReset={handleReset}
              t={t}
              lang={lang}
              autoPhaseEnabled={autoPhaseEnabled}
              onAutoPhaseChange={setAutoPhaseEnabled}
              weekStartsOn={weekStartsOn}
              onWeekStartsOnChange={setWeekStartsOn}
              availablePhases={availablePhases}
            />
            <div>
                <WeeklyPlanPanel
                    startDate={inputs.startDate}
                    currentPhase={inputs.phase}
                    plan={currentPlan.plan}
                    schedule={planSchedule}
                    t={t}
                    lang={lang}
                />
            </div>
             <div className="flex flex-col gap-4 sm:gap-6">
                <Tooltip text={t('tooltip_optimizer')}>
                  <div className="bg-card border border-border rounded-xl">
                      <button
                          onClick={() => setIsPlanOptimizerOpen(true)}
                          className="w-full bg-gradient-to-r from-brand-a/10 via-card to-card hover:from-brand-a/20 hover:border-brand-a/50 transition-all duration-300 p-4 rounded-xl border border-transparent"
                      >
                          <div className="flex items-center gap-4 text-left">
                              <div className="p-3 bg-brand-a/20 rounded-full">
                                  <Sparkles className="w-6 h-6 text-brand-b" />
                              </div>
                              <div>
                                  <h4 className="font-bold text-text-strong text-base">{t('optimizer_button')}</h4>
                                  <p className="text-sm text-muted">{t('optimizer_button_desc')}</p>
                              </div>
                          </div>
                      </button>
                  </div>
                </Tooltip>
                <Tooltip text={t('tooltip_analyzer')}>
                  <div className="bg-card border border-border rounded-xl">
                      <button
                          onClick={() => setIsAnalyzerOpen(true)}
                          className="w-full bg-gradient-to-r from-brand-b/10 via-card to-card hover:from-brand-b/20 hover:border-brand-b/50 transition-all duration-300 p-4 rounded-xl border border-transparent"
                      >
                          <div className="flex items-center gap-4 text-left">
                              <div className="p-3 bg-brand-b/20 rounded-full">
                                  <Camera className="w-6 h-6 text-brand-a" />
                              </div>
                              <div>
                                  <h4 className="font-bold text-text-strong text-base">{t('analyzer_button')}</h4>
                                  <p className="text-sm text-muted">{t('analyzer_button_desc')}</p>
                              </div>
                          </div>
                      </button>
                  </div>
                </Tooltip>
                <Tooltip text={t('tooltip_journal')}>
                  <div className="bg-card border border-border rounded-xl">
                      <button
                          onClick={() => setIsGrowManagerOpen(true)}
                          className="w-full bg-gradient-to-r from-brand-a/10 via-card to-card hover:from-brand-a/20 hover:border-brand-a/50 transition-all duration-300 p-4 rounded-xl border border-transparent"
                      >
                          <div className="flex items-center gap-4 text-left">
                              <div className="p-3 bg-brand-a/20 rounded-full">
                                  <BookOpen className="w-6 h-6 text-brand-b" />
                              </div>
                              <div>
                                  <h4 className="font-bold text-text-strong text-base">{t('journal_button')}</h4>
                                  <p className="text-sm text-muted">{t('journal_button_desc')}</p>
                              </div>
                          </div>
                      </button>
                  </div>
                </Tooltip>
            </div>
          </div>
          <div className="xl:col-span-3">
            {results && <ResultsPanel results={results} t={t} reservoir={inputs.reservoir} />}
          </div>
        </main>
        
      <div className="mt-4 sm:mt-6 print:hidden">
        <MixingInstructions t={t} />
      </div>

      <div className="hidden print:block p-4">
        <PlanPrintout plan={currentPlan.plan} t={t} lang={lang} />
      </div>
      </div>
      
      {isModalOpen && (
        <ConfigModal
          cultivar={cultivar}
          substrate={inputs.substrate}
          onClose={() => setIsModalOpen(false)}
          onPlanConfigurationChange={loadPlan}
          t={t}
          weekTag={weekTag}
          lang={lang}
          onCultivarChange={setCultivar}
        />
      )}
      
      {isAnalyzerOpen && (
        <PlantAnalyzerModal
          inputs={inputs}
          cultivar={cultivar}
          onClose={() => setIsAnalyzerOpen(false)}
          t={t}
          weekTag={weekTag}
          lang={lang}
          results={results}
          onShowError={showErrorToast}
        />
      )}

      {isGrowManagerOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setIsGrowManagerOpen(false)}>
           <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
             <GrowList
                onSelectGrow={handleSelectGrowForJournal}
                onCompareGrows={handleCompareGrows}
                t={t}
                lang={lang}
              />
           </div>
        </div>
      )}

      {isJournalOpen && activeGrowForJournal && (
        <JournalModal
          isOpen={isJournalOpen}
          onClose={() => { setIsJournalOpen(false); setIsGrowManagerOpen(true); }}
          growId={activeGrowForJournal.id}
          haSensorMapping={activeGrowForJournal.settings?.haSensorMapping}
          cultivar={activeGrowForJournal.cultivar}
          substrate={activeGrowForJournal.substrate}
          startDate={activeGrowForJournal.startDate}
          currentPhase={inputs.phase}
          t={t}
          lang={lang}
          inputs={inputs}
          currentPlan={currentPlan.plan}
          results={results}
        />
      )}

      {isPlanOptimizerOpen && (
        <PlanOptimizerModal
          isOpen={isPlanOptimizerOpen}
          onClose={() => setIsPlanOptimizerOpen(false)}
          cultivar={cultivar}
          substrate={inputs.substrate}
          basePlan={currentPlan}
          lang={lang}
          t={t}
          onPlanApplied={loadPlan}
        />
      )}

      {comparisonGrows && (
        <MultiGrowComparison
          grows={comparisonGrows}
          onClose={() => setComparisonGrows(null)}
          t={t}
          lang={lang}
        />
      )}

      {errorToast && (
        <ErrorToast
          title={errorToast.title}
          message={errorToast.message}
          code={errorToast.code}
          details={errorToast.details}
          retryLabel={errorToast.retryLabel}
          onRetry={
            errorToast.onRetry
              ? () => {
                  const retryAction = errorToast.onRetry;
                  setErrorToast(null);
                  return retryAction();
                }
              : undefined
          }
          onClose={() => setErrorToast(null)}
        />
      )}

    </div>
    </ErrorBoundary>
  );
};

export default App;