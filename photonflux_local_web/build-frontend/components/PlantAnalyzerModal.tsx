import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { DoserInput, CalculationResult } from '../services/doserService';
import type { Language, Phase, StageAnalysisResult, Cultivar, JournalEntry, Tipburn, Pale, CaMgDeficiency, Claw } from '../types';
import { I18N } from '../constants';
import { analyzePlantImage, AnalysisResult, analyzeGrowthStage } from '../services/aiService';
import { loadJournal, saveJournal } from '../services/journalService';
import { resizeImage, buildAnalyzerNotes, type AnalyzerStructuredInputs } from '../utils';
import ImageCropper from './ImageCropper';
import { X, Sparkles, Upload, RotateCcw, Lightbulb, Image as ImageIcon, Crop, XCircle, Loader, HelpCircle, BookOpen, CheckCircle } from './icons';
import Tooltip from './Tooltip';
import type { ErrorToastConfig } from './ErrorToast';

// Define a type for the image file with a preview URL
interface ImageFile {
  file: File;
  previewUrl: string;
}

interface PlantAnalyzerModalProps {
  inputs: DoserInput;
  cultivar: Cultivar;
  onClose: () => void;
  t: (key: string) => string;
  weekTag: (phase: Phase) => string;
  lang: Language;
  results: CalculationResult | null;
  onShowError?: (config: ErrorToastConfig) => void;
}

const MAX_PHOTOS = 5;

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

const PlantAnalyzerModal: React.FC<PlantAnalyzerModalProps> = ({ inputs, cultivar, onClose, t, weekTag, lang, results, onShowError }) => {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [userNotes, setUserNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [croppingState, setCroppingState] = useState<{ file: File; index: number; previewUrl: string } | null>(null);
  
  const [stageAnalysis, setStageAnalysis] = useState<StageAnalysisResult | null>(null);
  const [isStageLoading, setIsStageLoading] = useState(false);
  const [isSavedToJournal, setIsSavedToJournal] = useState(false);

  type AdjustmentState = {
      tipburn: Tipburn;
      pale: Pale;
      caMgDeficiency: CaMgDeficiency;
      claw: Claw;
  };

  const [localAdjustments, setLocalAdjustments] = useState<AdjustmentState>({
      tipburn: inputs.tipburn,
      pale: inputs.pale,
      caMgDeficiency: inputs.caMgDeficiency,
      claw: inputs.claw,
  });

  const [structuredInputs, setStructuredInputs] = useState<AnalyzerStructuredInputs>({
    problemLocation: '',
    problemSpread: '',
    recentChanges: '',
  });

  const handleLocalAdjustmentsChange = (key: keyof AdjustmentState, value: boolean) => {
      const nextValue: 'yes' | 'no' = value ? 'yes' : 'no';
      setLocalAdjustments(prev => ({ ...prev, [key]: nextValue } as AdjustmentState));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fullPhaseName = `${I18N[lang].phases[inputs.phase] || inputs.phase} ${weekTag(inputs.phase) ? `· ${weekTag(inputs.phase)}` : ''}`;

  const loadingMessages = [
    t('analyzer_loading_step1'),
    t('analyzer_loading_step2'),
    t('analyzer_loading_step3'),
    t('analyzer_loading_step4'),
  ];

  const runStageAnalysis = useCallback(async () => {
    if (!inputs.startDate) {
      setStageAnalysis(null);
      return;
    }

    const start = new Date(inputs.startDate + 'T00:00:00.000Z');
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    if (todayUTC < start) {
      setStageAnalysis(null);
      return;
    }

    const diffTime = todayUTC.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    setIsStageLoading(true);
    try {
      const response = await analyzeGrowthStage(inputs.phase, diffDays, lang);
      if (!response.ok) {
        setStageAnalysis(null);
        onShowError?.({
          title: t('ai_stage_analysis_title'),
          message: response.error.message,
          code: response.error.code,
          details: response.error.details,
          onRetry: () => runStageAnalysis(),
          retryLabel: t('analyzer_fail_try_again'),
        });
        return;
      }
      setStageAnalysis(response.data);
    } catch (err) {
      console.error('Stage analysis failed', err);
      setStageAnalysis(null);
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === 'de'
          ? 'Unbekannter Fehler bei der Stadienanalyse.'
          : 'Unexpected error during stage analysis.';
      onShowError?.({
        title: t('ai_stage_analysis_title'),
        message,
        code: 'UNEXPECTED_ERROR',
        details,
        onRetry: () => runStageAnalysis(),
        retryLabel: t('analyzer_fail_try_again'),
      });
    } finally {
      setIsStageLoading(false);
    }
  }, [inputs.startDate, inputs.phase, lang, onShowError, t]);

  useEffect(() => {
    void runStageAnalysis();
  }, [runStageAnalysis]);


  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      let i = 0;
      setLoadingMessage(loadingMessages[0]);
      interval = setInterval(() => {
        i = (i + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[i]);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLoading, loadingMessages, t]);

  const resetState = useCallback(() => {
    imageFiles.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setImageFiles([]);
    setUserNotes('');
    setIsLoading(false);
    setAnalysisResult(null);
    setError(null);
    setIsSavedToJournal(false);
    // Reset local adjustments to match app state
    setLocalAdjustments({
        tipburn: inputs.tipburn,
        pale: inputs.pale,
        caMgDeficiency: inputs.caMgDeficiency,
        claw: inputs.claw,
    });
    setStructuredInputs({
      problemLocation: '',
      problemSpread: '',
      recentChanges: '',
    });
  }, [imageFiles, inputs]);

  const handleFileChange = useCallback((files: FileList | null) => {
    if (!files) return;

    const acceptedFiles: File[] = [];
    const rejectedFiles: string[] = [];
    
    for(const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        if (imageFiles.length + acceptedFiles.length < MAX_PHOTOS) {
          acceptedFiles.push(file);
        }
      } else {
        rejectedFiles.push(file.name);
      }
    }

    if (rejectedFiles.length > 0) {
      alert(t('analyzer_invalid_file_alert').replace('{0}', rejectedFiles.join(', ')));
    }
    
    const ignoredCount = files.length - acceptedFiles.length - rejectedFiles.length;
    if (ignoredCount > 0) {
        alert(t('analyzer_upload_limit_alert').replace('{0}', String(MAX_PHOTOS)).replace('{1}', String(ignoredCount)));
    }

    const newImageFiles: ImageFile[] = acceptedFiles.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    
    setImageFiles(prev => [...prev, ...newImageFiles]);
  }, [imageFiles.length, t]);

  const handleDragEvents = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [handleDragEvents]);
  
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    setIsDragging(false);
  }, [handleDragEvents]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [handleDragEvents, handleFileChange]);
  
  const handleRemoveImage = useCallback((index: number) => {
    const fileToRemove = imageFiles[index];
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
      setImageFiles(prev => prev.filter((_, i) => i !== index));
    }
  }, [imageFiles]);
  
  const handleCropStart = useCallback((index: number) => {
    const img = imageFiles[index];
    if (img) {
      setCroppingState({ file: img.file, index, previewUrl: img.previewUrl });
    }
  }, [imageFiles]);

  const handleCropComplete = useCallback((croppedFile: File) => {
    if (croppingState !== null) {
      const { index } = croppingState;
      const oldFile = imageFiles[index];
      URL.revokeObjectURL(oldFile.previewUrl);
      
      const newImageFile = {
        file: croppedFile,
        previewUrl: URL.createObjectURL(croppedFile)
      };

      setImageFiles(prev => {
        const newFiles = [...prev];
        newFiles[index] = newImageFile;
        return newFiles;
      });
    }
    setCroppingState(null);
  }, [croppingState, imageFiles]);


  const handleAnalyze = async () => {
    if (imageFiles.length === 0) return;

    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    setIsSavedToJournal(false);

    const contextInputs: DoserInput = { ...inputs, ...localAdjustments };
    const combinedNotes = buildAnalyzerNotes(userNotes, structuredInputs);


    try {
      const response = await analyzePlantImage(
        imageFiles.map(f => f.file),
        contextInputs,
        fullPhaseName,
        combinedNotes || undefined,
        lang,
        results?.ppm
      );

      if (!response.ok) {
        const message = response.error.message;
        setError(message);
        onShowError?.({
          title: t('analyzer_fail_title'),
          message,
          code: response.error.code,
          details: response.error.details,
          onRetry: () => handleAnalyze(),
          retryLabel: t('analyzer_fail_try_again'),
        });
        return;
      }

      setAnalysisResult(response.data);
    } catch (err) {
      console.error('Image analysis failed', err);
      const details = err instanceof Error ? err.message : String(err);
      const message =
        lang === 'de'
          ? 'Unbekannter Fehler während der Analyse.'
          : 'Unexpected error during analysis.';
      setError(message);
      onShowError?.({
        title: t('analyzer_fail_title'),
        message,
        code: 'UNEXPECTED_ERROR',
        details,
        onRetry: () => handleAnalyze(),
        retryLabel: t('analyzer_fail_try_again'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToJournal = async () => {
    if (!analysisResult || !inputs.startDate) return;

    const base64Images = await Promise.all(
        imageFiles.map(imgFile => resizeImage(imgFile.file, 1024))
    );
    
    const newJournalEntry: JournalEntry = {
        id: self.crypto.randomUUID(),
        date: new Date().toISOString(),
        phase: inputs.phase,
        entryType: 'Observation',
        priority: analysisResult.potentialIssues.some(p => p.confidence === 'High') ? 'High' : 'Medium',
        notes: userNotes.trim(),
        images: base64Images,
        tags: [],
        metrics: {},
        adjustments: {
            trend: inputs.trend,
            tipburn: localAdjustments.tipburn,
            pale: localAdjustments.pale,
            caMgDeficiency: localAdjustments.caMgDeficiency,
            claw: localAdjustments.claw,
            phDrift: inputs.phDrift,
        },
        aiAnalysisResult: analysisResult,
    };

    try {
        const currentEntries = loadJournal(cultivar, inputs.substrate, inputs.startDate);
        const updatedEntries = [newJournalEntry, ...currentEntries];
        saveJournal(cultivar, inputs.substrate, inputs.startDate, updatedEntries);
        setIsSavedToJournal(true);
    } catch (e) {
        console.error("Failed to save analysis to journal", e);
        alert("Failed to save to journal.");
    }
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

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 h-full">
          <Loader className="w-12 h-12 text-brand-b animate-spin" />
          <p className="text-lg font-semibold mt-4 text-text-strong">{loadingMessage}</p>
          <p className="text-muted mt-1">{t('analyzer_loading_wait')}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 h-full">
          <XCircle className="w-12 h-12 text-red-500" />
          <h4 className="text-xl font-bold mt-4 text-red-400">{t('analyzer_fail_title')}</h4>
          <p className="text-muted mt-2 max-w-md">{error}</p>
          <button onClick={handleAnalyze} className="btn-primary mt-6 flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> {t('analyzer_fail_try_again')}
          </button>
        </div>
      );
    }

    if (analysisResult) {
      const keyFinding = analysisResult.potentialIssues[0];
      const topAction = analysisResult.recommendedActions[0];

      return (
        <div className="p-4 sm:p-6 text-sm">
           {/* Summary Section */}
          {keyFinding && topAction && (
             <div className="mb-4 p-4 border border-brand-b/50 bg-brand-b/10 rounded-lg">
                <h3 className="text-lg font-bold text-text-strong mb-2 flex items-center gap-2"><Sparkles className="w-5 h-5 text-brand-a"/>{t('analyzer_summary_title')}</h3>
                <div className="space-y-2">
                  <p><strong className="font-semibold text-text-strong">{t('analyzer_summary_finding')}:</strong> <span className="text-muted">{keyFinding.issue}</span></p>
                  <p><strong className="font-semibold text-text-strong">{t('analyzer_summary_action')}:</strong> <span className="text-muted">{topAction}</span></p>
                </div>
            </div>
          )}

          <div className="space-y-4">
            {analysisResult.potentialIssues.map((issue, index) => (
              <div key={index} className="bg-black/20 rounded-lg p-3">
                <h4 className="font-bold text-text-strong flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-300" />
                  {issue.issue} 
                  {renderConfidenceBadge(issue.confidence)}
                </h4>
                <p className="text-muted mt-1 pl-7">{issue.explanation}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <h4 className="font-bold text-text-strong flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-300" />
              {t('analyzer_actions_title')}
            </h4>
            <ul className="list-disc list-inside space-y-1 mt-2 pl-7 text-muted">
              {analysisResult.recommendedActions.map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted mt-4 text-center">{analysisResult.disclaimer}</p>
          
           <div className="flex gap-2 w-full mt-4">
              <button onClick={resetState} className="btn-secondary flex-1">{t('analyzer_another_photo')}</button>
              <Tooltip text={!inputs.startDate ? t('journal_set_start_date_prompt') : ''}>
                  <button 
                      onClick={handleSaveToJournal} 
                      disabled={!inputs.startDate || isSavedToJournal}
                      className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {isSavedToJournal ? (
                          <><CheckCircle className="w-5 h-5"/> {t('journal_analysis_saved')}</>
                      ) : (
                          <><BookOpen className="w-5 h-5"/> {t('journal_save_analysis')}</>
                      )}
                  </button>
              </Tooltip>
          </div>

        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6">
        {/* Left Panel: Image Upload */}
        <div className="flex flex-col">
          <div 
            className={`flex-grow flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging ? 'border-brand-b bg-brand-b/10' : 'border-border hover:border-brand-a'}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragEvents}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-10 h-10 text-muted" />
            <p className="mt-2 text-text-strong">{t('analyzer_drop_zone')}</p>
            <button onClick={() => fileInputRef.current?.click()} className="text-sm text-brand-b hover:underline mt-1">{t('browse_files')}</button>
            <p className="text-xs text-muted mt-3">{t('analyzer_photos_added').replace('{0}', String(imageFiles.length)).replace('{1}', String(MAX_PHOTOS))}</p>
            {imageFiles.length >= MAX_PHOTOS && <p className="text-xs text-amber-400 mt-1">{t('analyzer_max_photos_remove')}</p>}
          </div>
          
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
            {imageFiles.map((img, index) => (
              <div key={index} className="relative group aspect-square">
                <img src={img.previewUrl} alt={`preview ${index}`} className="w-full h-full object-cover rounded-md" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button onClick={() => handleCropStart(index)} className="p-1.5 rounded-full bg-black/50 hover:bg-black/80 text-white" title={t('analyzer_crop_photo').replace('{0}', String(index + 1))}>
                    <Crop className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleRemoveImage(index)} className="p-1.5 rounded-full bg-black/50 hover:bg-black/80 text-white" title={t('analyzer_remove_photo').replace('{0}', String(index + 1))}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
             {Array.from({ length: MAX_PHOTOS - imageFiles.length }).map((_, index) => (
                <div key={index} className="aspect-square bg-card border border-border rounded-md flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted" />
                </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Context & Action */}
        <div>
          <div className="bg-black/20 rounded-lg p-3">
            <h4 className="font-semibold text-cyan-300">{t('analyzer_context_title')}</h4>
            <div className="text-sm mt-2 space-y-1">
              <p><span className="font-semibold text-text-strong">{t('analyzer_phase')}</span> <span className="text-muted">{fullPhaseName}</span></p>
              <p><span className="font-semibold text-text-strong">{t('analyzer_substrate')}</span> <span className="text-muted">{inputs.substrate}</span></p>
            </div>
             <div className="mt-3 pt-3 border-t border-border/50">
                <h5 className="font-semibold text-cyan-300 text-xs uppercase tracking-wider">{t('ai_stage_analysis_title')}</h5>
                {isStageLoading && <p className="text-sm text-muted animate-pulse">{t('ai_stage_loading')}</p>}
                {stageAnalysis && !isStageLoading && (
                    <div className="text-sm mt-1">
                        <div className="flex justify-between items-center">
                           <span className="font-semibold text-text-strong">{t(`stage_${stageAnalysis.stage.toLowerCase()}`)}</span>
                           {renderConfidenceBadge(stageAnalysis.confidence)}
                        </div>
                        <p className="text-xs text-muted mt-1 flex items-start gap-1">
                          <Tooltip text={stageAnalysis.reasoning}><HelpCircle className="w-4 h-4 flex-shrink-0" /></Tooltip>
                          <span>{stageAnalysis.reasoning}</span>
                        </p>
                    </div>
                )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-black/20 rounded-lg">
              <label className="block text-sm font-semibold text-text-strong mb-2">{t('analyzer_observed_symptoms_title')}</label>
              <div className="grid grid-cols-2 gap-4">
                  {[
                      { id: 'tipburn', label: t('tipburn') },
                      { id: 'pale', label: t('very_pale') },
                      { id: 'caMgDeficiency', label: t('camg_need') },
                      { id: 'claw', label: t('claw') },
                  ].map(item => (
                      <div key={item.id} className="flex justify-between items-center">
                          <label htmlFor={`analyzer-adj-${item.id}`} className="text-sm text-muted">{item.label}</label>
                          <ToggleSwitch
                              id={`analyzer-adj-${item.id}`}
                              checked={localAdjustments[item.id as keyof typeof localAdjustments] === 'yes'}
                              onChange={checked => handleLocalAdjustmentsChange(item.id as keyof typeof localAdjustments, checked)}
                          />
                      </div>
                  ))}
              </div>
          </div>
          
          <div className="mt-4">
            <label htmlFor="userNotes" className="block text-sm font-semibold text-text-strong mb-1">{t('analyzer_notes_label')}</label>
            <textarea
              id="userNotes"
              rows={2}
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder={t('analyzer_notes_placeholder')}
              className="w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none transition-shadow"
            />
          </div>

          <div className="mt-4 space-y-2">
            <div>
              <label htmlFor="problemLocation" className="block text-sm font-semibold text-text-strong mb-1">Wo an der Pflanze tritt das Problem zuerst auf?</label>
              <input type="text" id="problemLocation" value={structuredInputs.problemLocation} onChange={e => setStructuredInputs(p => ({...p, problemLocation: e.target.value}))} className="w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none transition-shadow" placeholder="z.B. alte Blätter, neue Triebe" />
            </div>
            <div>
              <label htmlFor="problemSpread" className="block text-sm font-semibold text-text-strong mb-1">Wie schnell breitet sich das Problem aus?</label>
              <input type="text" id="problemSpread" value={structuredInputs.problemSpread} onChange={e => setStructuredInputs(p => ({...p, problemSpread: e.target.value}))} className="w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none transition-shadow" placeholder="z.B. langsam, über Nacht" />
            </div>
            <div>
              <label htmlFor="recentChanges" className="block text-sm font-semibold text-text-strong mb-1">Haben Sie in den letzten 48 Stunden etwas geändert?</label>
              <input type="text" id="recentChanges" value={structuredInputs.recentChanges} onChange={e => setStructuredInputs(p => ({...p, recentChanges: e.target.value}))} className="w-full bg-[#0c1424] text-text border border-[#243251] rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-b focus:outline-none transition-shadow" placeholder="z.B. Nährlösung, Licht, Temperatur" />
            </div>
          </div>
          
          <button 
            onClick={handleAnalyze} 
            disabled={imageFiles.length === 0 || isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-5 h-5" />
            {t('analyzer_button_cta')}
          </button>
          
          <p className="text-xs text-muted mt-3 text-center">{t('analyzer_disclaimer')}</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
        <div 
          className="w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-xl flex flex-col" 
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex justify-between items-center p-4 border-b border-border flex-shrink-0">
            <h3 className="text-xl font-bold text-text-strong">{t('analyzer_title')}</h3>
            <button onClick={onClose} className="text-muted hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </header>
          
          <div className="flex-grow overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>

      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={(e) => handleFileChange(e.target.files)}
        className="hidden"
      />
      
      {croppingState && (
        <ImageCropper
          imageSrc={croppingState.previewUrl}
          originalFileName={croppingState.file.name}
          onCropComplete={handleCropComplete}
          onCancel={() => setCroppingState(null)}
          t={t}
        />
      )}
    </>
  );
};

export default PlantAnalyzerModal;