// FIX: Create full content for JournalModal.tsx to resolve module errors.
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { loadJournal, saveJournal, subscribe as subscribeJournal } from '../services/journalService';
import { resizeImage, getStageInfo } from '../utils';
import { analyzePlantImage, AnalysisResult } from '../services/aiService';
// FIX: Module '"../types"' has no exported member 'DoserInput'. DoserInput is exported from '../services/doserService'.
import type { DoserInput, CalculationResult } from '../services/doserService';
import type { JournalEntry, Cultivar, Substrate, Phase, Language, Plan, JournalEntryType, JournalPriority, HarvestDetails, HASensorMapping } from '../types';
import { X, Plus, Image as ImageIcon, Trash2, Edit, Save, Sparkles, Loader, Lightbulb, MessageSquare, Droplet, Bug, Scissors, ChevronUp, Minus, ChevronDown, Filter, AlertTriangle, HarvestIcon, Download, Activity } from './icons';
import { I18N } from '../constants';
import Tooltip from './Tooltip';
import JournalMetricsChart from './JournalMetricsChart';
import GrowthTimeline from './GrowthTimeline';
import PhotoGallery from './PhotoGallery';


interface JournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  growId: string;
  haSensorMapping?: HASensorMapping;
  cultivar: Cultivar;
  substrate: Substrate;
  startDate: string | undefined;
  currentPhase: Phase;
  t: (key: string) => string;
  lang: Language;
  inputs: DoserInput;
  currentPlan: Plan;
  results: CalculationResult | null;
}

const ToggleSwitch: React.FC<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
}> = ({ id, checked, onChange, size = 'md' }) => {
  const isSmall = size === 'sm';
  return (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        id={id}
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className={isSmall
        ? "w-9 h-5 bg-border rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-b peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-b"
        : "w-11 h-6 bg-border rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-b peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-b"
      }></div>
    </label>
  );
};

const EntryTypeButton: React.FC<{ type: JournalEntryType; label: string; icon: React.ReactNode; isActive: boolean; onClick: () => void; }> = ({ type, label, icon, isActive, onClick }) => {
  const typeColors: Record<JournalEntryType, string> = {
    Observation: 'border-blue-500 bg-blue-500/10 text-blue-300',
    Feeding: 'border-green-500 bg-green-500/10 text-green-300',
    Pest: 'border-red-500 bg-red-500/10 text-red-300',
    Training: 'border-purple-500 bg-purple-500/10 text-purple-300',
    Harvest: 'border-orange-500 bg-orange-500/10 text-orange-300',
  };
  const activeClass = isActive ? `ring-2 ring-offset-2 ring-offset-bg ${typeColors[type]}` : 'border-border hover:bg-white/5';
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center p-3 border rounded-lg text-center transition-all duration-200 ${activeClass}`}>
      {icon}
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
};

const PriorityButton: React.FC<{ priority: JournalPriority, label: string; icon: React.ReactNode; isActive: boolean; onClick: () => void; }> = ({ priority, label, icon, isActive, onClick }) => {
    const priorityColors: Record<JournalPriority, string> = {
        High: 'text-red-400',
        Medium: 'text-yellow-400',
        Low: 'text-blue-400',
    };
    const activeClass = isActive ? `bg-white/10 ring-1 ${priority === 'High' ? 'ring-red-500' : priority === 'Medium' ? 'ring-yellow-500' : 'ring-blue-500'}` : 'bg-black/20 hover:bg-white/5';

    return (
        <button onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${activeClass}`}>
            <span className={priorityColors[priority]}>{icon}</span>
            {label}
        </button>
    )
}

type JournalView = 'list' | 'timeline' | 'gallery';

const JournalModal: React.FC<JournalModalProps> = ({
  isOpen, onClose, growId, haSensorMapping, cultivar, substrate, startDate, currentPhase, t, lang, inputs, currentPlan, results
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<JournalEntry>>({});
  const [priorityFilter, setPriorityFilter] = useState<JournalPriority | 'All'>('All');
  const [filterAiOnly, setFilterAiOnly] = useState(false);
  const [currentView, setCurrentView] = useState<JournalView>('list');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [haLoading, setHaLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const modalInputClasses = "w-full bg-[#0c1424] text-text border border-[#243251] rounded-md px-2 py-1 text-center focus:ring-1 focus:ring-brand-b focus:outline-none";
  const inputBaseClasses = "w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none";
  const textareaClasses = "w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none transition-shadow";
  const labelClasses = "block text-sm font-semibold text-text-strong mb-1";

  useEffect(() => {
    if (!isOpen || !growId) {
      return;
    }

    const updateEntries = () => {
      const loadedEntries = loadJournal(growId);
      setEntries(loadedEntries);
      setSelectedEntry((prev) => {
        if (!loadedEntries.length) {
          return null;
        }
        if (!prev) {
          return loadedEntries[0];
        }
        const existing = loadedEntries.find((entry) => entry.id === prev.id);
        return existing ?? loadedEntries[0];
      });
    };

    updateEntries();
    setIsEditing(false);

    const unsubscribe = subscribeJournal(growId, updateEntries);
    return () => {
      unsubscribe();
    };
  }, [isOpen, growId]);

  const handleSave = useCallback((newEntries: JournalEntry[]) => {
    const sorted = newEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveJournal(growId, sorted);
    setEntries(sorted);
  }, [growId]);
  
  const getWeekNumber = useCallback((entryDateStr: string): number => {
    if (!startDate) return 0;
    const start = new Date(startDate + 'T00:00:00.000Z');
    const entryDate = new Date(entryDateStr);
    const entryDateUTC = new Date(Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate()));
    if (entryDateUTC < start) return 0;
    const diffTime = entryDateUTC.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
  }, [startDate]);


  const getPrefilledFeedingDetails = useCallback(() => {
    if (results && results.adjustedValues) {
      const planEntry = currentPlan.find(p => p.phase === currentPhase);
      return {
        A: results.adjustedValues.A,
        X: results.adjustedValues.X,
        BZ: results.adjustedValues.BZ,
        EC: results.adjustedValues.ec,
        pH: planEntry?.pH || '',
      };
    }
    const planEntry = currentPlan.find(p => p.phase === currentPhase);
    return planEntry ? { A: planEntry.A, X: planEntry.X, BZ: planEntry.BZ, EC: planEntry.EC, pH: planEntry.pH } : undefined;
  }, [currentPlan, currentPhase, results]);


  const createNewEntry = () => {
    const newEntry: Partial<JournalEntry> = {
      id: ((typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())),
      date: new Date().toISOString(),
      phase: currentPhase,
      entryType: 'Observation',
      priority: 'Medium',
      notes: '',
      images: [],
      tags: [],
      metrics: {},
      adjustments: {
        trend: inputs.trend,
        tipburn: inputs.tipburn,
        pale: inputs.pale,
        caMgDeficiency: inputs.caMgDeficiency,
        claw: inputs.claw,
        phDrift: inputs.phDrift,
      },
      aiAnalysisResult: undefined,
      feedingDetails: undefined,
      harvestDetails: undefined,
    };
    setFormData(newEntry);
    setSelectedEntry(newEntry as JournalEntry);
    setIsEditing(true);
  };
  
  const handleEditEntry = (entry: JournalEntry) => {
    const entryToEdit = { ...entry };
    // Ensure nested objects exist for editing older entries
    if (!entryToEdit.adjustments) {
        entryToEdit.adjustments = { trend: 'neutral', tipburn: 'no', pale: 'no', caMgDeficiency: 'no', claw: 'no', phDrift: 'normal' };
    }
    if (!entryToEdit.metrics) entryToEdit.metrics = {};
    if (!entryToEdit.tags) entryToEdit.tags = [];
    if (!entryToEdit.images) entryToEdit.images = [];
    
    setFormData(entryToEdit);
    setIsEditing(true);
  };


  const handleFormChange = (field: keyof JournalEntry, value: any) => {
    setFormData(prev => ({...prev, [field]: value}));
  };
  
  const handleFeedingDetailsChange = (field: string, value: string) => {
      setFormData(prev => {
          const newDetails = { ...prev.feedingDetails! };
          if (field === 'A' || field === 'X' || field === 'BZ') {
              (newDetails as any)[field] = parseFloat(value) || 0;
          } else {
              (newDetails as any)[field] = value;
          }
          return { ...prev, feedingDetails: newDetails };
      });
  };

  const handleMetricsChange = (field: keyof JournalEntry['metrics'], value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    setFormData(prev => ({
        ...prev,
        metrics: {
            ...prev.metrics,
            [field]: numValue,
        }
    }));
  };

  const handleFetchHAValues = async () => {
    if (!haSensorMapping) return;
    setHaLoading(true);
    const newMetrics = { ...formData.metrics };

    const fetchMetric = async (key: keyof HASensorMapping, metricKey: keyof JournalEntry['metrics']) => {
      const entityId = haSensorMapping[key];
      if (entityId) {
        try {
          const res = await fetch(`api/ha/state/${encodeURIComponent(entityId)}`);
          if (res.ok) {
            const data = await res.json();
            const val = parseFloat(data.state);
            if (!isNaN(val)) {
              (newMetrics as any)[metricKey] = val;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch ${key} from HA`, error);
        }
      }
    };

    await Promise.all([
      fetchMetric('temp', 'temp'),
      fetchMetric('humidity', 'humidity'),
      fetchMetric('ec', 'ec'),
      fetchMetric('ph', 'ph'),
      fetchMetric('ppfd', 'ppfd'),
      fetchMetric('co2', 'co2'),
      fetchMetric('rootTemp', 'rootTemp'),
      fetchMetric('leafTemp', 'leafTemp'),
      fetchMetric('vpd', 'vpd'),
      fetchMetric('vwc', 'vwc'),
      fetchMetric('soilEc', 'soilEc'),
    ]);

    setFormData(prev => ({ ...prev, metrics: newMetrics }));
    setHaLoading(false);
  };

  const handleHarvestDetailsChange = (field: keyof HarvestDetails, value: string | number) => {
    setFormData(prev => ({
        ...prev,
        harvestDetails: {
            ...prev.harvestDetails,
            [field]: value,
        }
    }));
  };
  
  const handleAdjustmentsChange = (field: keyof NonNullable<JournalEntry['adjustments']>, value: string) => {
      setFormData(prev => {
        const currentAdjustments = prev.adjustments || { trend: 'neutral', tipburn: 'no', pale: 'no', caMgDeficiency: 'no', claw: 'no', phDrift: 'normal' };
        return {
            ...prev,
            adjustments: {
                ...currentAdjustments,
                [field]: value,
            }
        };
      });
  };

  useEffect(() => {
    if (formData.entryType === 'Feeding' && !formData.feedingDetails) {
        handleFormChange('feedingDetails', getPrefilledFeedingDetails());
    }
    if (formData.entryType === 'Harvest' && !formData.harvestDetails) {
        handleFormChange('harvestDetails', {});
    }
  }, [formData.entryType, formData.feedingDetails, formData.harvestDetails, getPrefilledFeedingDetails]);
  

  const handleSaveEntry = () => {
    const finalEntry = { ...formData } as JournalEntry;
    if (!finalEntry.id) finalEntry.id = ((typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()));
    if (!finalEntry.date) finalEntry.date = new Date().toISOString();
    const existingIndex = entries.findIndex(e => e.id === finalEntry.id);
    let newEntries;
    if (existingIndex > -1) {
      newEntries = [...entries];
      newEntries[existingIndex] = finalEntry;
    } else {
      newEntries = [finalEntry, ...entries];
    }
    handleSave(newEntries);
    setIsEditing(false);
    setSelectedEntry(finalEntry);
  };

  const handleDeleteEntry = (id: string) => {
    if (window.confirm(t('journal_confirm_delete'))) {
      const newEntries = entries.filter(e => e.id !== id);
      handleSave(newEntries);
      if (selectedEntry?.id === id) {
        setSelectedEntry(newEntries.length > 0 ? newEntries[0] : null);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const resizedImages = await Promise.all(
        files.map(file => resizeImage(file, 1024))
      );
      const currentImages = formData.images || [];
      handleFormChange('images', [...currentImages, ...resizedImages].slice(0, 5));
    }
  };
  
  const handleRemoveImage = (index: number) => {
      const currentImages = formData.images || [];
      handleFormChange('images', currentImages.filter((_, i) => i !== index));
  }
  
  const handleAnalyzeWithAI = async () => {
    if (!formData.images || formData.images.length === 0) return;
    
    setAiLoading(true);
    setAiError(null);
    
    const imageFiles = await Promise.all(formData.images.map(async (b64, i) => {
        const res = await fetch(b64);
        const blob = await res.blob();
        return new File([blob], `image_${i}.jpg`, { type: 'image/jpeg' });
    }));
    
    try {
      const response = await analyzePlantImage(
        imageFiles,
        inputs,
        `${I18N[lang].phases[formData.phase!]}`,
        formData.notes ?? undefined,
        lang,
        results?.ppm
      );
      if (!response.ok) {
        setAiError(response.error.message);
        return;
      }
      handleFormChange('aiAnalysisResult', response.data);
      setAiError(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  };


  const filteredEntries = useMemo(() => {
    let tempEntries = entries;
    if (priorityFilter !== 'All') {
        tempEntries = tempEntries.filter(e => e.priority === priorityFilter);
    }
    if (filterAiOnly) {
        tempEntries = tempEntries.filter(e => !!e.aiAnalysisResult);
    }
    return tempEntries;
  }, [entries, priorityFilter, filterAiOnly]);

  const entryTypeIcons: Record<JournalEntryType, React.ReactNode> = {
    Observation: <MessageSquare className="w-5 h-5" />,
    Feeding: <Droplet className="w-5 h-5" />,
    Pest: <Bug className="w-5 h-5" />,
    Training: <Scissors className="w-5 h-5" />,
    Harvest: <HarvestIcon className="w-5 h-5" />,
  };
  
   const priorityIcons: Record<JournalPriority, React.ReactNode> = {
      High: <ChevronUp className="w-4 h-4"/>,
      Medium: <Minus className="w-4 h-4"/>,
      Low: <ChevronDown className="w-4 h-4"/>,
  }

  const entryTypeColors: Record<JournalEntryType, string> = {
    Observation: 'text-blue-400',
    Feeding: 'text-green-400',
    Pest: 'text-red-400',
    Training: 'text-purple-400',
    Harvest: 'text-orange-400',
  };
  
   const priorityColors: Record<JournalPriority, string> = {
      High: 'text-red-400',
      Medium: 'text-yellow-400',
      Low: 'text-blue-400',
  };
  
  const renderConfidenceBadge = (confidence: 'High' | 'Medium' | 'Low') => {
      const confidenceText = t(`confidence_${confidence}`);
      const styles = {
          High: 'bg-green-500/30 text-green-300',
          Medium: 'bg-yellow-500/30 text-yellow-300',
          Low: 'bg-gray-500/30 text-gray-300',
      };
      return <span className={`text-xs px-2 py-0.5 rounded-full ${styles[confidence]}`}>{confidenceText}</span>;
  };

  const handleExportJournal = () => {
    if (!startDate) return;
    const key = `journal-${cultivar}-${substrate}-${startDate}`;
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${key}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!isOpen) return null;
  
  if (!startDate) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-md bg-[#0e1728] border border-border rounded-xl flex flex-col text-center p-8" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-xl font-bold text-text-strong">{t('journal_title')}</h3>
          <p className="text-muted mt-4">{t('journal_set_start_date_prompt')}</p>
          <button onClick={onClose} className="btn-secondary mt-6">{t('close')}</button>
        </div>
      </div>
    );
  }

  const renderSelectedEntry = () => {
    const entry = selectedEntry;
    if (!entry) return <div className="flex-1 flex items-center justify-center text-muted">{t('journal_empty_state')}</div>;

    if (isEditing) {
        const stageInfo = getStageInfo(formData.phase || currentPhase);
        const xNameKey = stageInfo.class === 'VEG' ? 'B_name' : 'C_name';
        const xName = t(xNameKey);
        const adjustments = formData.adjustments || { trend: 'neutral', tipburn: 'no', pale: 'no', caMgDeficiency: 'no', claw: 'no', phDrift: 'normal' };

        return (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <h3 className="font-bold text-lg text-text-strong mb-4">{formData.id ? t('journal_edit_entry') : t('journal_add_entry')}</h3>
                <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClasses} htmlFor="entry-date">{t('date')}</label>
                            <input
                                id="entry-date"
                                type="date"
                                className={inputBaseClasses}
                                value={formData.date ? new Date(formData.date).toISOString().slice(0, 10) : ''}
                                onChange={e => handleFormChange('date', new Date(e.target.value).toISOString())}
                            />
                        </div>
                        <div>
                            <label className={labelClasses} htmlFor="entry-phase">{t('phase')}</label>
                            <select
                                id="entry-phase"
                                className={inputBaseClasses}
                                value={formData.phase}
                                onChange={e => handleFormChange('phase', e.target.value as Phase)}
                            >
                                {Object.keys(I18N.de.phases).map(phaseKey => {
                                    const p = phaseKey as Phase;
                                    const translatedPhase = I18N[lang].phases[p] || p;
                                    return <option key={p} value={p}>{translatedPhase}</option>;
                                })}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={labelClasses}>{t('journal_entry_type')}</label>
                        <div className="grid grid-cols-5 gap-2">
                            {(Object.keys(entryTypeIcons) as JournalEntryType[]).map(type => (
                                <EntryTypeButton 
                                    key={type} type={type} label={t(`journal_type_${type}`)} icon={entryTypeIcons[type]}
                                    isActive={formData.entryType === type} onClick={() => handleFormChange('entryType', type)}
                                />
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <label className={labelClasses}>{t('journal_priority')}</label>
                        <div className="flex gap-2">
                            {(Object.keys(priorityIcons) as JournalPriority[]).map(p => (
                                <PriorityButton
                                    key={p} priority={p} label={t(`journal_priority_${p}`)} icon={priorityIcons[p]}
                                    isActive={formData.priority === p} onClick={() => handleFormChange('priority', p)}
                                />
                            ))}
                        </div>
                    </div>
                    
                    {formData.entryType === 'Feeding' && formData.feedingDetails && (
                        <div className="p-3 bg-black/20 rounded-lg">
                            <h4 className="font-semibold text-text-strong mb-2">{t('journal_feeding_details')}</h4>
                            <p className="text-xs text-muted mb-2">{t('journal_feeding_prefilled')}</p>
                            <div className="grid grid-cols-5 gap-2 text-sm">
                                <div>
                                    <label className="text-xs text-muted block text-center mb-1">{t('A_name').split(' ')[0]}</label>
                                    <input type="number" step="0.01" className={modalInputClasses} value={formData.feedingDetails.A} onChange={e => handleFeedingDetailsChange('A', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted block text-center mb-1">{xName.split(' ')[0]}</label>
                                    <input type="number" step="0.01" className={modalInputClasses} value={formData.feedingDetails.X} onChange={e => handleFeedingDetailsChange('X', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted block text-center mb-1">{t('BURST_name')}</label>
                                    <input type="number" step="0.01" className={modalInputClasses} value={formData.feedingDetails.BZ} onChange={e => handleFeedingDetailsChange('BZ', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted block text-center mb-1">EC</label>
                                    <input type="text" className={modalInputClasses} value={formData.feedingDetails.EC} onChange={e => handleFeedingDetailsChange('EC', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted block text-center mb-1">pH</label>
                                    <input type="text" className={modalInputClasses} value={formData.feedingDetails.pH} onChange={e => handleFeedingDetailsChange('pH', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}

                    {formData.entryType === 'Harvest' && (
                        <div className="p-3 bg-black/20 rounded-lg">
                            <h4 className="font-semibold text-text-strong mb-2">{t('journal_harvest_details')}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                <div>
                                    <label className="text-xs text-muted">{t('journal_wet_weight')}</label>
                                    <input type="number" step="0.1" className={modalInputClasses} value={formData.harvestDetails?.wetWeight ?? ''} onChange={e => handleHarvestDetailsChange('wetWeight', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted">{t('journal_dry_weight')}</label>
                                    <input type="number" step="0.1" className={modalInputClasses} value={formData.harvestDetails?.dryWeight ?? ''} onChange={e => handleHarvestDetailsChange('dryWeight', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted">{t('journal_trim_weight')}</label>
                                    <input type="number" step="0.1" className={modalInputClasses} value={formData.harvestDetails?.trimWeight ?? ''} onChange={e => handleHarvestDetailsChange('trimWeight', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted">{t('journal_quality_rating')}</label>
                                    <input type="number" step="1" min="1" max="5" className={modalInputClasses} value={formData.harvestDetails?.qualityRating ?? ''} onChange={e => handleHarvestDetailsChange('qualityRating', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted">{t('journal_density_rating')}</label>
                                    <input type="number" step="1" min="1" max="5" className={modalInputClasses} value={formData.harvestDetails?.densityRating ?? ''} onChange={e => handleHarvestDetailsChange('densityRating', e.target.value)} />
                                </div>
                                 <div>
                                    <label className="text-xs text-muted">Terpenprofil</label>
                                    <input type="text" className={modalInputClasses} value={formData.harvestDetails?.terpenProfile ?? ''} onChange={e => handleHarvestDetailsChange('terpenProfile', e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs text-muted">Harzbesatz</label>
                                     <select className={modalInputClasses} value={formData.harvestDetails?.resinProduction ?? ''} onChange={e => handleHarvestDetailsChange('resinProduction', e.target.value)}>
                                        <option value="">-</option>
                                        <option value="Low">Gering</option>
                                        <option value="Medium">Mittel</option>
                                        <option value="High">Hoch</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-3">
                                <label className="text-xs text-muted">Notizen zum Trocknen/Fermentieren</label>
                                <textarea rows={3} className={textareaClasses} value={formData.harvestDetails?.dryingNotes ?? ''} onChange={e => handleHarvestDetailsChange('dryingNotes', e.target.value)} />
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className={labelClasses}>{t('journal_metrics_title')}</label>
                            {haSensorMapping && Object.keys(haSensorMapping).length > 0 && (
                                <button
                                    onClick={handleFetchHAValues}
                                    disabled={haLoading}
                                    className="text-xs text-brand-a hover:text-brand-b flex items-center gap-1 transition-colors"
                                >
                                    {haLoading ? <Loader className="w-3 h-3 animate-spin"/> : <Activity className="w-3 h-3"/>}
                                    {t('fetch_ha_values') || 'Fetch from HA'}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-black/20 rounded-lg">
                            <div>
                                <label className="text-xs text-muted">{t('journal_plant_height')}</label>
                                <input type="number" step="0.1" className={modalInputClasses} value={formData.metrics?.plantHeight ?? ''} onChange={e => handleMetricsChange('plantHeight', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">{t('journal_temp')}</label>
                                <input type="number" step="0.1" className={modalInputClasses} value={formData.metrics?.temp ?? ''} onChange={e => handleMetricsChange('temp', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">{t('journal_humidity')}</label>
                                <input type="number" step="0.1" className={modalInputClasses} value={formData.metrics?.humidity ?? ''} onChange={e => handleMetricsChange('humidity', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">{t('journal_ec')}</label>
                                <input type="number" step="0.01" className={modalInputClasses} value={formData.metrics?.ec ?? ''} onChange={e => handleMetricsChange('ec', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">{t('journal_ph')}</label>
                                <input type="number" step="0.01" className={modalInputClasses} value={formData.metrics?.ph ?? ''} onChange={e => handleMetricsChange('ph', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">PPFD</label>
                                <input type="number" step="1" className={modalInputClasses} value={formData.metrics?.ppfd ?? ''} onChange={e => handleMetricsChange('ppfd', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">CO2 (ppm)</label>
                                <input type="number" step="1" className={modalInputClasses} value={formData.metrics?.co2 ?? ''} onChange={e => handleMetricsChange('co2', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">Wurzeltemp (°C)</label>
                                <input type="number" step="0.1" className={modalInputClasses} value={formData.metrics?.rootTemp ?? ''} onChange={e => handleMetricsChange('rootTemp', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">Blatttemp (°C)</label>
                                <input type="number" step="0.1" className={modalInputClasses} value={formData.metrics?.leafTemp ?? ''} onChange={e => handleMetricsChange('leafTemp', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">VPD (kPa)</label>
                                <input type="number" step="0.01" className={modalInputClasses} value={formData.metrics?.vpd ?? ''} onChange={e => handleMetricsChange('vpd', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">VWC (%)</label>
                                <input type="number" step="0.1" className={modalInputClasses} value={formData.metrics?.vwc ?? ''} onChange={e => handleMetricsChange('vwc', e.target.value)} />
                            </div>
                             <div>
                                <label className="text-xs text-muted">Boden EC</label>
                                <input type="number" step="0.01" className={modalInputClasses} value={formData.metrics?.soilEc ?? ''} onChange={e => handleMetricsChange('soilEc', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="p-3 bg-black/20 rounded-lg">
                        <h4 className="font-semibold text-text-strong mb-2">{t('journal_adjustments_edit_title')}</h4>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="journal-trend" className="block text-sm mb-1">{t('trend')}</label>
                                <select id="journal-trend" value={adjustments.trend} onChange={e => handleAdjustmentsChange('trend', e.target.value)} className={inputBaseClasses}>
                                    <option value="neutral">{t('neutral')}</option>
                                    <option value="higher">{t('higher')}</option>
                                    <option value="lower">{t('lower')}</option>
                                </select>
                            </div>
                             <div>
                                <label htmlFor="journal-phdrift" className="block text-sm mb-1">{t('ph_drift')}</label>
                                <select id="journal-phdrift" value={adjustments.phDrift} onChange={e => handleAdjustmentsChange('phDrift', e.target.value)} className={inputBaseClasses}>
                                    <option value="normal">{t('normal')}</option>
                                    <option value="high">{t('too_high')}</option>
                                    <option value="low">{t('too_low')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-border/50">
                            {[
                                { id: 'tipburn', label: t('tipburn'), value: adjustments.tipburn },
                                { id: 'pale', label: t('very_pale'), value: adjustments.pale },
                                { id: 'caMgDeficiency', label: t('camg_need'), value: adjustments.caMgDeficiency },
                                { id: 'claw', label: t('claw'), value: adjustments.claw },
                            ].map(item => (
                                <div key={item.id} className="flex justify-between items-center">
                                    <label htmlFor={`journal-adj-${item.id}`} className="text-sm">{item.label}</label>
                                    <ToggleSwitch
                                        id={`journal-adj-${item.id}`}
                                        checked={item.value === 'yes'}
                                        onChange={checked => handleAdjustmentsChange(item.id as keyof typeof adjustments, checked ? 'yes' : 'no')}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <label className={labelClasses} htmlFor="notes-editor">{t('note')}</label>
                        <textarea 
                            id="notes-editor" rows={5} className={textareaClasses} placeholder={t('journal_notes_placeholder')}
                            value={formData.notes} onChange={e => handleFormChange('notes', e.target.value)}
                        />
                    </div>
                    
                    <div>
                        <label className={labelClasses} htmlFor="tags-editor">{t('journal_tags_label')}</label>
                        <input
                            id="tags-editor" type="text" className={inputBaseClasses} placeholder={t('journal_tags_placeholder')}
                            value={(formData.tags || []).join(', ')}
                            onChange={e => handleFormChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                        />
                    </div>

                     <div>
                        <label className={labelClasses} htmlFor="related-entry">Bezug zu Eintrag</label>
                        <select
                            id="related-entry"
                            className={inputBaseClasses}
                            value={formData.relatedEntryId || ''}
                            onChange={e => handleFormChange('relatedEntryId', e.target.value)}
                        >
                            <option value="">-</option>
                            {entries.map(e => (
                                <option key={e.id} value={e.id}>
                                    {new Date(e.date).toLocaleDateString(lang)} - {t(`journal_type_${e.entryType}`)}: {e.notes.substring(0, 30)}...
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="grid grid-cols-5 gap-2">
                            {(formData.images || []).map((img, i) => (
                                <div key={i} className="relative group aspect-square">
                                    <img src={img} className="w-full h-full object-cover rounded-md" alt={`upload preview ${i}`} />
                                    <button onClick={() => handleRemoveImage(i)} className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                                </div>
                            ))}
                            {(!formData.images || formData.images.length < 5) && (
                                <button onClick={() => fileInputRef.current?.click()} className="aspect-square bg-card border border-border rounded-md flex flex-col items-center justify-center text-muted hover:bg-white/5 transition-colors">
                                    <Plus className="w-6 h-6"/>
                                    <span className="text-xs mt-1">{t('journal_add_photos')}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div>
                        {formData.aiAnalysisResult ? (
                            <div className="p-3 bg-brand-b/10 border border-brand-b/50 rounded-lg">
                                <h4 className="font-bold text-brand-a flex items-center gap-2 mb-2">
                                    <Sparkles className="w-5 h-5" />
                                    {t('journal_ai_result')}
                                </h4>
                                {formData.aiAnalysisResult.potentialIssues.map((issue, i) => (
                                    <div key={i} className="mb-2">
                                        <p className="font-semibold text-text-strong flex items-center gap-2">
                                            <Lightbulb className="w-4 h-4 text-yellow-300" />
                                            {issue.issue}
                                            {renderConfidenceBadge(issue.confidence)}
                                        </p>
                                        <p className="text-sm text-muted pl-6">{issue.explanation}</p>
                                    </div>
                                ))}
                                <ul className="list-disc list-inside text-sm text-muted pl-6 mt-2">
                                    {formData.aiAnalysisResult.recommendedActions.map((action, i) => (
                                        <li key={i}>{action}</li>
                                    ))}
                                </ul>
                                <button
                                    onClick={() => handleFormChange('aiAnalysisResult', undefined)}
                                    className="btn-secondary text-red-500 hover:bg-red-500/10 w-full mt-2 flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {t('journal_remove_ai_analysis')}
                                </button>
                            </div>
                        ) : (
                            formData.images && formData.images.length > 0 && (
                                <>
                                    <button
                                        onClick={handleAnalyzeWithAI}
                                        disabled={aiLoading}
                                        className="btn-secondary w-full flex items-center justify-center gap-2"
                                    >
                                        {aiLoading ? (
                                            <Loader className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="w-4 h-4 text-brand-b" />
                                        )}
                                        {aiLoading ? t('loading') : t('journal_analyze_with_ai')}
                                    </button>
                                    {aiError && (
                                        <p className="text-red-500 text-xs mt-1 text-center">{aiError}</p>
                                    )}
                                </>
                            )
                        )}
                    </div>
                </div>

                <div className="flex gap-2 pt-4 mt-4 border-t border-border">
                    <button onClick={() => { setIsEditing(false); setSelectedEntry(entries.find(e => e.id === formData.id) || null); }} className="btn-secondary flex-1">{t('cancel')}</button>
                    <button onClick={handleSaveEntry} className="btn-primary flex-1 flex items-center justify-center gap-2"><Save className="w-4 h-4"/>{t('journal_save_entry')}</button>
                </div>
            </div>
        );
    }
    
    const activeAdjustments: {label: string, value?: string}[] = [];
    if (entry.adjustments) {
        if (entry.adjustments.tipburn === 'yes') activeAdjustments.push({ label: t('tipburn') });
        if (entry.adjustments.pale === 'yes') activeAdjustments.push({ label: t('very_pale') });
        if (entry.adjustments.caMgDeficiency === 'yes') activeAdjustments.push({ label: t('camg_need') });
        if (entry.adjustments.claw === 'yes') activeAdjustments.push({ label: t('claw') });
        if (entry.adjustments.trend !== 'neutral') activeAdjustments.push({ label: t('trend'), value: t(entry.adjustments.trend) });
        if (entry.adjustments.phDrift !== 'normal') activeAdjustments.push({ label: t('ph_drift'), value: t(entry.adjustments.phDrift === 'high' ? 'too_high' : 'too_low')});
    }

    const hasMetrics = entry.metrics && Object.values(entry.metrics).some(v => v !== undefined && v !== null);
    const relatedEntry = entry.relatedEntryId ? entries.find(e => e.id === entry.relatedEntryId) : null;

    return (
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className={`flex items-center gap-2 font-bold text-lg ${entryTypeColors[entry.entryType]}`}>
                  {entryTypeIcons[entry.entryType]}
                  {t(`journal_type_${entry.entryType}`)}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted">
                 <span>{new Date(entry.date).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                 <span>·</span>
                 <span>{t('journal_week')} {getWeekNumber(entry.date)}</span>
                 <span>·</span>
                 <span>{I18N[lang].phases[entry.phase]}</span>
              </div>
            </div>
             <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm bg-black/20 ${priorityColors[entry.priority]}`}>
                {priorityIcons[entry.priority]}
                {t(`journal_priority_${entry.priority}`)}
             </div>
          </div>
          
           {relatedEntry && (
            <div className="my-4 p-3 bg-blue-900/30 rounded-lg">
                <p className="text-sm text-blue-200">
                    Bezieht sich auf: <button onClick={() => setSelectedEntry(relatedEntry)} className="font-semibold underline hover:text-white">{new Date(relatedEntry.date).toLocaleDateString(lang)} - {relatedEntry.notes.substring(0, 40)}...</button>
                </p>
            </div>
          )}

          <p className="text-text whitespace-pre-wrap my-4">{entry.notes}</p>

          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 my-4">
                {entry.tags.map((tag, i) => (
                    <span key={i} className="bg-gray-700 text-gray-300 text-xs font-semibold px-2 py-1 rounded-full">{tag}</span>
                ))}
            </div>
          )}

          {hasMetrics && (
            <div className="my-4 p-3 bg-black/20 rounded-lg">
                <h4 className="font-semibold text-text-strong mb-2">{t('journal_metrics_title')}</h4>
                <div className="flex flex-wrap gap-2 text-sm font-mono text-center">
                    {entry.metrics?.plantHeight !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">{t('journal_plant_height_short')}: {entry.metrics.plantHeight}cm</div>}
                    {entry.metrics?.temp !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">{t('journal_temp_short')}: {entry.metrics.temp}°C</div>}
                    {entry.metrics?.humidity !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">{t('journal_humidity_short')}: {entry.metrics.humidity}%</div>}
                    {entry.metrics?.ec !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">EC: {entry.metrics.ec.toFixed(2)}</div>}
                    {entry.metrics?.ph !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">pH: {entry.metrics.ph.toFixed(2)}</div>}
                    {entry.metrics?.ppfd !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">PPFD: {entry.metrics.ppfd}</div>}
                    {entry.metrics?.co2 !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">CO2: {entry.metrics.co2}ppm</div>}
                    {entry.metrics?.rootTemp !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">Wurzeln: {entry.metrics.rootTemp}°C</div>}
                    {entry.metrics?.leafTemp !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">Blatt: {entry.metrics.leafTemp}°C</div>}
                    {entry.metrics?.vpd !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">VPD: {entry.metrics.vpd}kPa</div>}
                    {entry.metrics?.vwc !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">VWC: {entry.metrics.vwc}%</div>}
                    {entry.metrics?.soilEc !== undefined && <div className="bg-bg p-2 rounded-md flex-1 min-w-[80px]">BodenEC: {entry.metrics.soilEc}</div>}
                </div>
            </div>
          )}

          <JournalMetricsChart entries={entries} lang={lang} t={t} highlightEntryId={entry.id} />

          {activeAdjustments.length > 0 && (
            <div className="my-4 p-3 bg-black/20 rounded-lg">
                <h4 className="font-semibold text-text-strong mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    {t('journal_adjustments_title')}
                </h4>
                <div className="flex flex-wrap gap-2">
                    {activeAdjustments.map((adj, i) => (
                        <span key={i} className="bg-amber-900/50 text-amber-300 text-xs font-semibold px-2 py-1 rounded-full">
                            {adj.label}{adj.value ? `: ${adj.value}` : ''}
                        </span>
                    ))}
                </div>
            </div>
          )}

          {entry.images && entry.images.length > 0 && (
              <div className="grid grid-cols-5 gap-2 my-4">
                  {entry.images.map((img, i) => <img key={i} src={img} className="w-full h-full object-cover rounded-md aspect-square" alt={`journal entry ${i}`}/>)}
              </div>
          )}

          {entry.feedingDetails && (
               <div className="my-4 p-3 bg-black/20 rounded-lg">
                <h4 className="font-semibold text-text-strong mb-2">{t('journal_feeding_details')}</h4>
                <div className="grid grid-cols-5 gap-2 text-sm font-mono text-center">
                    <div className="bg-bg p-1 rounded">A: {typeof entry.feedingDetails.A === 'number' ? entry.feedingDetails.A.toFixed(2) : entry.feedingDetails.A}</div>
                    <div className="bg-bg p-1 rounded">X: {typeof entry.feedingDetails.X === 'number' ? entry.feedingDetails.X.toFixed(2) : entry.feedingDetails.X}</div>
                    <div className="bg-bg p-1 rounded">BZ: {typeof entry.feedingDetails.BZ === 'number' ? entry.feedingDetails.BZ.toFixed(2) : entry.feedingDetails.BZ}</div>
                    <div className="bg-bg p-1 rounded">EC: {entry.feedingDetails.EC}</div>
                    <div className="bg-bg p-1 rounded">pH: {entry.feedingDetails.pH}</div>
                </div>
            </div>
          )}

           {entry.harvestDetails && (
              <div className="my-4 p-3 bg-black/20 rounded-lg">
                <h4 className="font-semibold text-text-strong mb-2 flex items-center gap-2"><HarvestIcon className="w-4 h-4 text-orange-400"/>{t('journal_harvest_details')}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm font-mono text-center">
                    {entry.harvestDetails.wetWeight !== undefined && <div className="bg-bg p-2 rounded-md">{t('journal_wet_weight').split(' ')[0]}: {entry.harvestDetails.wetWeight.toFixed(1)}g</div>}
                    {entry.harvestDetails.dryWeight !== undefined && <div className="bg-bg p-2 rounded-md">{t('journal_dry_weight').split(' ')[0]}: {entry.harvestDetails.dryWeight.toFixed(1)}g</div>}
                    {entry.harvestDetails.trimWeight !== undefined && <div className="bg-bg p-2 rounded-md">{t('journal_trim_weight').split(' ')[0]}: {entry.harvestDetails.trimWeight.toFixed(1)}g</div>}
                    {entry.harvestDetails.qualityRating !== undefined && <div className="bg-bg p-2 rounded-md">{t('journal_quality_rating').split(' ')[0]}: {entry.harvestDetails.qualityRating}/5</div>}
                    {entry.harvestDetails.densityRating !== undefined && <div className="bg-bg p-2 rounded-md">{t('journal_density_rating').split(' ')[0]}: {entry.harvestDetails.densityRating}/5</div>}
                    {entry.harvestDetails.terpenProfile && <div className="bg-bg p-2 rounded-md">Terpene: {entry.harvestDetails.terpenProfile}</div>}
                    {entry.harvestDetails.resinProduction && <div className="bg-bg p-2 rounded-md">Harz: {entry.harvestDetails.resinProduction}</div>}
                </div>
                {entry.harvestDetails.dryingNotes && <p className="text-xs text-muted mt-2">Notizen: {entry.harvestDetails.dryingNotes}</p>}
            </div>
          )}

          {entry.aiAnalysisResult && (
              <div className="my-4 p-3 bg-brand-b/10 border border-brand-b/50 rounded-lg">
                  <h4 className="font-bold text-brand-a flex items-center gap-2 mb-2"><Sparkles className="w-5 h-5"/>{t('journal_ai_result')}</h4>
                  {entry.aiAnalysisResult.potentialIssues.map((issue, i) => (
                      <div key={i} className="mb-2">
                          <p className="font-semibold text-text-strong flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-yellow-300"/>{issue.issue} 
                            {renderConfidenceBadge(issue.confidence)}
                          </p>
                          <p className="text-sm text-muted pl-6">{issue.explanation}</p>
                      </div>
                  ))}
                   <ul className="list-disc list-inside text-sm text-muted pl-6 mt-2">
                       {entry.aiAnalysisResult.recommendedActions.map((action, i) => <li key={i}>{action}</li>)}
                   </ul>
              </div>
          )}

          <div className="flex gap-2 mt-auto">
             <button onClick={() => handleDeleteEntry(entry.id)} className="btn-secondary flex items-center gap-2 text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4"/>{t('journal_delete_entry')}</button>
             <button onClick={() => handleEditEntry(entry)} className="btn-secondary flex-1 flex items-center justify-center gap-2"><Edit className="w-4 h-4"/>{t('journal_edit_entry')}</button>
          </div>
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-6xl h-[90vh] bg-[#0e1728] border border-border rounded-xl flex" onClick={(e) => e.stopPropagation()}>
        {/* Left Pane: Entry List */}
        <div className="w-1/3 border-r border-border flex flex-col">
           <header className="flex justify-between items-center p-4 border-b border-border">
              <div>
                <h3 className="text-xl font-bold text-text-strong">{t('journal_title')}</h3>
                <p className="text-xs text-muted capitalize">{cultivar.replace('_', ' ')} / {substrate}</p>
              </div>
              <div className="flex items-center gap-2">
                  <Tooltip text={t('journal_export')}>
                      <button onClick={handleExportJournal} className="btn-secondary p-2.5">
                          <Download className="w-4 h-4"/>
                      </button>
                  </Tooltip>
                  <button onClick={createNewEntry} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/>{t('journal_add_entry')}</button>
              </div>
           </header>
            <div className="p-2 border-b border-border flex justify-between items-center">
                 <div className="flex items-center gap-2 text-sm">
                    <button onClick={() => setCurrentView('list')} className={`px-3 py-1 rounded ${currentView === 'list' ? 'bg-brand-a/20 text-brand-a' : 'hover:bg-white/5'}`}>List</button>
                    <button onClick={() => setCurrentView('timeline')} className={`px-3 py-1 rounded ${currentView === 'timeline' ? 'bg-brand-a/20 text-brand-a' : 'hover:bg-white/5'}`}>Timeline</button>
                    <button onClick={() => setCurrentView('gallery')} className={`px-3 py-1 rounded ${currentView === 'gallery' ? 'bg-brand-a/20 text-brand-a' : 'hover:bg-white/5'}`}>Gallery</button>
                </div>
            </div>
           <div className="p-2 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                    <Filter className="w-4 h-4 text-muted"/>
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)} className="bg-transparent text-text border-0 focus:ring-0 text-sm">
                        <option value="All">{t('journal_all_priorities')}</option>
                        <option value="High">{t('journal_priority_High')}</option>
                        <option value="Medium">{t('journal_priority_Medium')}</option>
                        <option value="Low">{t('journal_priority_Low')}</option>
                    </select>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <label htmlFor="ai-filter" className="text-muted cursor-pointer flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-brand-b"/>
                        {t('journal_ai_filter_label')}
                    </label>
                    <ToggleSwitch id="ai-filter" checked={filterAiOnly} onChange={setFilterAiOnly} size="sm" />
                </div>
           </div>
           <div className="overflow-y-auto flex-1">
                {currentView === 'list' && filteredEntries.map(entry => (
                    <button key={entry.id} onClick={() => { setSelectedEntry(entry); setIsEditing(false); }} className={`w-full text-left p-3 border-b border-border hover:bg-white/5 transition-colors ${selectedEntry?.id === entry.id && !isEditing ? 'bg-brand-a/10' : ''}`}>
                        <div className="flex justify-between items-start">
                           <span className={`flex items-center gap-2 text-sm font-semibold ${entryTypeColors[entry.entryType]}`}>{entryTypeIcons[entry.entryType]} {t(`journal_type_${entry.entryType}`)}</span>
                           <span className="text-xs text-muted">{new Date(entry.date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <p className="text-sm text-muted mt-1 truncate">{entry.notes || "No notes"}</p>
                         <div className="flex items-center gap-2 mt-2">
                             {entry.images && entry.images.length > 0 && <ImageIcon className="w-4 h-4 text-muted"/>}
                             {entry.aiAnalysisResult && <Sparkles className="w-4 h-4 text-brand-b"/>}
                             <div className={`flex-1 flex justify-end ${priorityColors[entry.priority]}`}>
                                {priorityIcons[entry.priority]}
                             </div>
                         </div>
                    </button>
                ))}
                {currentView === 'timeline' && startDate && <GrowthTimeline entries={entries} startDate={startDate} onSelectEntry={setSelectedEntry} />}
                {currentView === 'gallery' && <PhotoGallery entries={entries} onSelectEntry={setSelectedEntry} />}
           </div>
        </div>

        {/* Right Pane: Selected Entry Details / Editor */}
        <div className="w-2/3 flex flex-col">
            <header className="flex justify-end p-2 border-b border-border">
                <button onClick={onClose} className="text-muted hover:text-white p-2"><X className="w-5 h-5" /></button>
            </header>
            {renderSelectedEntry()}
        </div>
        
        <input
            type="file"
            accept="image/*"
            multiple
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
        />
      </div>
    </div>
  );
};

export default JournalModal;
