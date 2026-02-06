import React, { useState, useEffect, useCallback } from 'react';
import type { DoserInput } from '../services/doserService';
import type { Language, Phase, WeekStartDay } from '../types';
import { I18N } from '../constants';
import { Sparkles, RotateCcw, AlertTriangle } from './icons';
import Tooltip, { InfoTooltip } from './Tooltip';
import { getStageInfo, getPhaseTag } from '../utils';

interface InputPanelProps {
  inputs: DoserInput;
  onInputChange: <K extends keyof DoserInput>(key: K, value: DoserInput[K]) => void;
  onCalculate: () => void;
  onReset: () => void;
  t: (key: string) => string;
  lang: Language;
  autoPhaseEnabled: boolean;
  onAutoPhaseChange: (enabled: boolean) => void;
  weekStartsOn: WeekStartDay;
  onWeekStartsOnChange: (day: WeekStartDay) => void;
  availablePhases: Phase[];
}

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`bg-card border border-border rounded-xl p-4 sm:p-5 ${className}`}>
        {children}
    </div>
);

const Fieldset: React.FC<{ legend: string; children: React.ReactNode }> = ({ legend, children }) => (
    <fieldset className="border border-border rounded-lg p-3 mb-3">
        <legend className="px-2 text-xs font-semibold text-text-strong uppercase tracking-wider">{legend}</legend>
        {children}
    </fieldset>
);

const Label: React.FC<{ children: React.ReactNode; htmlFor: string; className?: string }> = ({ children, htmlFor, className }) => (
    <label htmlFor={htmlFor} className={`inline-flex items-center gap-1 text-sm font-semibold text-text-strong mb-1 mt-2 ${className}`}>{children}</label>
);

const baseInputClasses = "w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed";

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select {...props} className={`${baseInputClasses} ${props.className}`} />
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className={`${baseInputClasses} ${props.type === 'date' ? '[color-scheme:dark]' : ''} ${props.className}`} />
);

const ToggleSwitch: React.FC<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, checked, onChange }) => {
  return (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        id={id}
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="w-11 h-6 bg-border rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-b peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-b"></div>
    </label>
  );
};

const InputPanel: React.FC<InputPanelProps> = ({ inputs, onInputChange, onCalculate, onReset, t, lang, autoPhaseEnabled, onAutoPhaseChange, weekStartsOn, onWeekStartsOnChange, availablePhases }) => {
    
    const [changedInput, setChangedInput] = useState<string | null>(null);

    const handleLocalInputChange = useCallback(<K extends keyof DoserInput>(key: K, value: DoserInput[K]) => {
        setChangedInput(key);
        onInputChange(key, value);
    }, [onInputChange]);

    useEffect(() => {
        if (changedInput) {
            const timer = setTimeout(() => {
                setChangedInput(null);
            }, 700); // Animation duration
            return () => clearTimeout(timer);
        }
    }, [changedInput]);
    
    const weekTag = (phase: Phase): string => getPhaseTag(phase, lang);
    
    const selectedStageInfo = getStageInfo(inputs.phase);
    const Icon = selectedStageInfo.IconComponent;

    return (
        <Card>
            <div>
                <Fieldset legend={t('phase_week')}>
                    <label htmlFor="phase" className="sr-only">{t('phase_week')}</label>
                    <div className="relative">
                         <Icon
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                            style={{ color: selectedStageInfo.color }}
                            aria-hidden="true"
                        />
                        <Select
                            id="phase"
                            value={inputs.phase}
                            onChange={e => handleLocalInputChange('phase', e.target.value as DoserInput['phase'])}
                            className={`${changedInput === 'phase' ? 'animate-pulse-border' : ''} pl-10`}
                            disabled={autoPhaseEnabled}
                        >
                            {availablePhases.map(phaseKey => {
                                const p = phaseKey as Phase;
                                const translatedPhase = I18N[lang].phases[p] || p;
                                const tag = weekTag(p);
                                const stageInfo = getStageInfo(p);
                                return (
                                    <option key={p} value={p}>
                                        {stageInfo.icon} {tag ? `${translatedPhase} · ${tag}` : translatedPhase}
                                    </option>
                                );
                            })}
                        </Select>
                    </div>
                </Fieldset>
            </div>
            
            <div>
                <Fieldset legend={t('settings')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <div>
                            <Label htmlFor="res" className="block">{t('reservoir')}</Label>
                            <Input id="res" type="number" value={inputs.reservoir} min="1" step="1" onChange={e => handleLocalInputChange('reservoir', parseFloat(e.target.value) || 1)} className={changedInput === 'reservoir' ? 'animate-pulse-border' : ''} />
                        </div>
                        <div>
                            <Label htmlFor="substrat" className="block">{t('substrate')}</Label>
                            <Select id="substrat" value={inputs.substrate} onChange={e => handleLocalInputChange('substrate', e.target.value as DoserInput['substrate'])} className={changedInput === 'substrate' ? 'animate-pulse-border' : ''}>
                                <option value="coco">{lang === 'de' ? 'Coco' : 'Coco'}</option>
                                <option value="soil">{lang === 'de' ? 'Erde' : 'Soil'}</option>
                                <option value="rockwool">{lang === 'de' ? 'Steinwolle' : 'Rockwool'}</option>
                            </Select>
                        </div>
                         <div>
                            <Label htmlFor="trend" className="block">{t('trend')} <InfoTooltip text={t('tooltip_trend')} /></Label>
                            <Select id="trend" value={inputs.trend} onChange={e => handleLocalInputChange('trend', e.target.value as DoserInput['trend'])} className={`${inputs.trend !== 'neutral' ? 'ring-2 ring-amber-500/80' : ''} ${changedInput === 'trend' ? 'animate-pulse-border' : ''}`}>
                                <option value="neutral">{t('neutral')}</option>
                                <option value="higher">{t('higher')}</option>
                                <option value="lower">{t('lower')}</option>
                            </Select>
                        </div>
                         <div>
                            <Label htmlFor="phdrift" className="block">{t('ph_drift')} <InfoTooltip text={t('tooltip_phDrift')} /></Label>
                            <Select id="phdrift" value={inputs.phDrift} onChange={e => handleLocalInputChange('phDrift', e.target.value as DoserInput['phDrift'])} className={`${inputs.phDrift !== 'normal' ? 'ring-2 ring-amber-500/80' : ''} ${changedInput === 'phDrift' ? 'animate-pulse-border' : ''}`}>
                                <option value="normal">{t('normal')}</option>
                                <option value="high">{t('too_high')}</option>
                                <option value="low">{t('too_low')}</option>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div>
                            <Label htmlFor="start-date" className="block">{t('start_date')} <InfoTooltip text={t('tooltip_start_date')} /></Label>
                            <Input 
                                id="start-date" 
                                type="date" 
                                value={inputs.startDate || ''} 
                                onChange={e => handleLocalInputChange('startDate', e.target.value)} 
                                className={changedInput === 'startDate' ? 'animate-pulse-border' : ''} 
                            />
                        </div>
                        <div>
                            <Label htmlFor="week-starts-on">{t('week_starts_on')} <InfoTooltip text={t('tooltip_week_starts_on')} /></Label>
                            <Select id="week-starts-on" value={weekStartsOn} onChange={e => onWeekStartsOnChange(parseInt(e.target.value, 10) as WeekStartDay)}>
                                {Object.entries(I18N[lang].days_of_week).map(([value, name]) => (
                                    <option key={value} value={value}>{name as string}</option>
                                ))}
                            </Select>
                        </div>
                         <div className="flex flex-col justify-end md:col-span-2">
                           <div className="flex justify-between items-center mt-2">
                               <Label htmlFor="auto-phase" className="mb-0 mt-0">
                                 {t('auto_phase_switch')}
                                 <InfoTooltip text={t('tooltip_auto_phase_switch')} />
                               </Label>
                               <div className={`p-1 rounded-full`}>
                                   <ToggleSwitch
                                       id="auto-phase"
                                       checked={autoPhaseEnabled}
                                       onChange={onAutoPhaseChange}
                                   />
                               </div>
                           </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                        {[
                            { id: 'tipburn', label: t('tipburn'), value: inputs.tipburn },
                            { id: 'pale', label: t('very_pale'), value: inputs.pale },
                            { id: 'caMgDeficiency', label: t('camg_need'), value: inputs.caMgDeficiency },
                            { id: 'claw', label: t('claw'), value: inputs.claw },
                        ].map(item => (
                            <div key={item.id} className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    {item.value === 'yes' && <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                                    <Label htmlFor={item.id} className="mb-0 mt-0">
                                      {item.label}
                                      {(['tipburn', 'claw', 'pale', 'caMgDeficiency'].includes(item.id)) && <InfoTooltip text={t(`tooltip_${item.id === 'pale' ? 'pale' : item.id === 'caMgDeficiency' ? 'caMgDeficiency' : item.id}`)} />}
                                    </Label>
                                </div>
                                <div className={`p-1 rounded-full ${changedInput === item.id ? 'animate-pulse-border' : ''}`}>
                                    <ToggleSwitch
                                        id={item.id}
                                        checked={item.value === 'yes'}
                                        onChange={checked => handleLocalInputChange(item.id as keyof DoserInput, checked ? 'yes' : 'no')}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Fieldset>
            </div>
            
            <div className="flex flex-col gap-2 mt-4">
                <Tooltip text={t('tooltip_calculate')}>
                     <button onClick={onCalculate} className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-xl font-bold shadow-lg shadow-brand-b/30 hover:shadow-2xl hover:shadow-brand-a/40 transform hover:scale-[1.03] transition-all duration-300">
                        <Sparkles className="w-5 h-5" />
                        {t('calculate')}
                    </button>
                </Tooltip>
                 <Tooltip text={t('tooltip_reset')}>
                    <button onClick={onReset} className="btn-secondary w-full flex items-center justify-center gap-2">
                        <RotateCcw className="w-4 h-4" />
                        {t('reset')}
                    </button>
                </Tooltip>
            </div>
        </Card>
    );
};

const style = document.createElement('style');
style.innerHTML = `
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
`;
document.head.appendChild(style);

export default InputPanel;