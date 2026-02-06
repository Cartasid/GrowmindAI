import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Plus, Sparkles, Loader2, Trash2 } from "lucide-react";
import type {
  AiAnalysisResponse,
  AnalyzerInputs,
  JournalEntry,
  Language,
  Phase,
} from "../types";
import { useJournal } from "../hooks/useJournal";
import { analyzeGrowthStage, analyzePlantImage } from "../services/aiService";

interface JournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  growId: string;
  lang: Language;
  phase: Phase;
  analyzerInputs?: AnalyzerInputs;
}

const JOURNAL_TYPES = ["Observation", "Feeding", "Pest", "Training", "Harvest"] as const;
const JOURNAL_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const createEmptyEntry = (phase: Phase): Partial<JournalEntry> => ({
  date: new Date().toISOString(),
  phase,
  entryType: "Observation",
  priority: "Medium",
  notes: "",
  images: [],
  tags: [],
  metrics: {},
});

export function JournalModal({
  isOpen,
  onClose,
  growId,
  lang,
  phase,
  analyzerInputs,
}: JournalModalProps) {
  const {
    entries,
    status,
    error,
    selectedEntry,
    selectEntry,
    addEntry,
    updateEntry,
    removeEntry,
  } = useJournal(growId);

  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<JournalEntry>>(createEmptyEntry(phase));
  const [localImages, setLocalImages] = useState<File[]>([]);
  const [aiResult, setAiResult] = useState<AiAnalysisResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [stageMessage, setStageMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isCreating) {
      setFormData(createEmptyEntry(phase));
      setLocalImages([]);
      setAiResult(null);
      return;
    }
    if (!selectedEntry) {
      setFormData(createEmptyEntry(phase));
      setLocalImages([]);
      setAiResult(null);
      return;
    }
    setFormData(selectedEntry);
    setLocalImages([]);
    setAiResult(selectedEntry.aiAnalysisResult ?? null);
  }, [selectedEntry, phase, isCreating]);

  const handleFieldChange = useCallback(<K extends keyof JournalEntry>(key: K, value: JournalEntry[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleMetricChange = (metric: keyof JournalEntry["metrics"], value: string) => {
    setFormData((prev) => ({
      ...prev,
      metrics: {
        ...(prev.metrics || {}),
        [metric]: value === "" ? undefined : Number(value),
      },
    }));
  };

  const handleImagesSelected = async (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files).slice(0, 4);
    setLocalImages(picked);
    const payload = await Promise.all(picked.map(fileToBase64));
    setFormData((prev) => ({ ...prev, images: payload }));
  };

  const handleSave = async () => {
    const baseEntry: JournalEntry = {
      id: formData.id ?? "",
      growId,
      date: formData.date ?? new Date().toISOString(),
      phase: formData.phase ?? phase,
      entryType: (formData.entryType as JournalEntry["entryType"]) ?? "Observation",
      priority: (formData.priority as JournalEntry["priority"]) ?? "Medium",
      notes: formData.notes ?? "",
      images: formData.images ?? [],
      tags: formData.tags ?? [],
      metrics: formData.metrics ?? {},
      feedingDetails: formData.feedingDetails,
      adjustments: formData.adjustments,
      aiAnalysisResult: aiResult ?? formData.aiAnalysisResult,
      harvestDetails: formData.harvestDetails,
      relatedEntryId: formData.relatedEntryId,
    };

    try {
      if (isCreating || !formData.id) {
        const saved = await addEntry(baseEntry);
        setIsCreating(false);
        selectEntry(saved.id);
      } else {
        await updateEntry({ ...baseEntry, id: formData.id });
      }
    } catch (err) {
      console.error("Journal save failed", err);
    }
  };

  const handleDelete = async () => {
    if (selectedEntry?.id) {
      try {
        await removeEntry(selectedEntry.id);
      } catch (err) {
        console.error("Journal delete failed", err);
      }
    }
  };

  const handleAiAnalyze = async () => {
    if (!localImages.length) {
      setAiError(
        lang === "de"
          ? "Bitte lade zuerst Bilder hoch, um die Analyse zu starten."
          : "Please upload at least one photo before running the analysis."
      );
      return;
    }
    setAiLoading(true);
    setAiError(null);
    const response = await analyzePlantImage(
      localImages,
      analyzerInputs || {},
      formData.phase ?? phase,
      formData.notes ?? undefined,
      lang,
      undefined,
      entries
    );
    if (response.ok) {
      setAiResult(response.data);
      setFormData((prev) => ({ ...prev, aiAnalysisResult: response.data }));
    } else {
      setAiError(response.error.message);
    }
    setAiLoading(false);
  };

  const handleStageAnalyze = async () => {
    setStageMessage(null);
    const response = await analyzeGrowthStage(formData.phase ?? phase, 0, lang);
    if (response.ok) {
      setStageMessage(
        `${response.data.stage} · ${response.data.confidence} — ${response.data.reasoning}`
      );
    } else {
      setStageMessage(response.error.message);
    }
  };

  const metricsList: { key: keyof JournalEntry["metrics"]; label: string; unit?: string }[] = [
    { key: "temp", label: "Temp", unit: "°C" },
    { key: "humidity", label: "RH", unit: "%" },
    { key: "ec", label: "EC", unit: "mS" },
    { key: "ph", label: "pH" },
    { key: "ppfd", label: "PPFD" },
  ];

  const listContent = useMemo(() => {
    if (!entries.length) {
      return (
        <p className="text-sm text-white/60">
          {lang === "de" ? "Noch keine Einträge" : "No entries yet"}
        </p>
      );
    }
    return (
      <div className="space-y-3 overflow-y-auto pr-2" style={{ maxHeight: "60vh" }}>
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              setIsCreating(false);
              selectEntry(entry.id);
            }}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              selectedEntry?.id === entry.id
                ? "border-brand-cyan/50 bg-brand-cyan/10 shadow-brand-glow"
                : "border-white/10 bg-black/30 hover:border-brand-cyan/30 hover:bg-white/5"
            }`}
          >
            <p className="meta-mono text-[10px] text-white/50">
              {new Date(entry.date).toLocaleString()}
            </p>
            <p className="text-base font-medium text-white">{entry.entryType}</p>
            <p className="text-sm text-white/60 line-clamp-2">{entry.notes || "…"}</p>
          </button>
        ))}
      </div>
    );
  }, [entries, lang, selectEntry, selectedEntry]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-lg">
      <div className="glass-panel relative flex h-[90vh] w-[94vw] max-w-6xl flex-col overflow-hidden rounded-3xl text-white shadow-neon sm:h-[85vh] sm:w-[90vw]">
        <header className="flex flex-col gap-4 border-b border-white/10 bg-black/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Grow Journal</p>
            <h2 className="gradient-text text-2xl font-light">{growId}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-1 text-[11px] uppercase tracking-[0.3em] shadow-glass-inner ${
                status === "ready" ? "text-grow-lime" : status === "error" ? "text-brand-red" : "text-white/70"
              }`}
            >
              {status === "loading" && <Loader2 className="icon-base icon-sm animate-spin" />}
              {status === "ready"
                ? lang === "de"
                  ? "Synchronisiert"
                  : "Synced"
                : status === "error"
                ? error || (lang === "de" ? "Fehler" : "Error")
                : lang === "de"
                ? "Lade"
                : "Loading"}
            </span>
            <button
              className="rounded-full border border-white/20 bg-black/40 p-2 text-white/70 transition hover:border-brand-cyan/40 hover:text-white"
              onClick={onClose}
            >
              <X className="icon-base icon-md" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[320px_1fr]">
          <aside className="border-b border-white/10 bg-black/30 px-5 py-4 backdrop-blur-xl lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {lang === "de" ? "Einträge" : "Entries"} ({entries.length})
              </p>
              <button
                className="rounded-full border border-brand-cyan/30 bg-black/40 p-2 text-brand-cyan shadow-brand-glow hover:border-brand-cyan/60"
                onClick={() => {
                  setIsCreating(true);
                  selectEntry(null);
                }}
              >
                <Plus className="icon-base icon-sm" />
              </button>
            </div>
            <div className="mt-4">{listContent}</div>
          </aside>

          <section className="flex flex-col overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                  {lang === "de" ? "Datum" : "Date"}
                </label>
                <input
                  type="datetime-local"
                  value={
                    formData.date ? new Date(formData.date).toISOString().slice(0, 16) : ""
                  }
                  onChange={(e: any) => handleFieldChange("date", new Date(e.target.value).toISOString())}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-[0.3em] text-white/50">Phase</label>
                <input
                  value={formData.phase ?? phase}
                  onChange={(e: any) => handleFieldChange("phase", e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                  {lang === "de" ? "Typ" : "Type"}
                </label>
                <select
                  value={formData.entryType}
                  onChange={(e: any) =>
                    handleFieldChange("entryType", e.target.value as JournalEntry["entryType"])
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                >
                  {JOURNAL_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-[#070a16]">
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                  {lang === "de" ? "Priorität" : "Priority"}
                </label>
                <select
                  value={formData.priority}
                  onChange={(e: any) =>
                    handleFieldChange("priority", e.target.value as JournalEntry["priority"])
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                >
                  {JOURNAL_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority} className="bg-[#070a16]">
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                {lang === "de" ? "Notizen" : "Notes"}
              </label>
              <textarea
                value={formData.notes ?? ""}
                onChange={(e: any) => handleFieldChange("notes", e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {metricsList.map(({ key, label, unit }) => (
                <div key={key} className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formData.metrics?.[key] ?? ""}
                      onChange={(e: any) => handleMetricChange(key, e.target.value)}
                      className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                    />
                    {unit && <span className="text-sm text-white/50">{unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <label className="inline-flex cursor-pointer flex-col rounded-2xl border border-dashed border-brand-cyan/30 bg-black/30 px-6 py-4 text-center text-white/70 hover:border-brand-cyan/60">
                <span className="text-sm font-medium">
                  {lang === "de" ? "Bilder hochladen" : "Upload images"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e: any) => handleImagesSelected(e.target.files)}
                />
              </label>
              {formData.images?.map((img) => (
                <img
                  key={img}
                  src={img}
                  alt="journal"
                  className="h-16 w-16 rounded-2xl border border-white/10 object-cover sm:h-20 sm:w-20"
                />
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <button
                onClick={handleAiAnalyze}
                className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-6 py-2 text-sm text-brand-cyan shadow-brand-glow transition hover:border-brand-cyan/70 hover:bg-brand-cyan/20"
              >
                {aiLoading ? (
                  <Loader2 className="icon-base icon-sm animate-spin" />
                ) : (
                  <Sparkles className="icon-base icon-sm" />
                )}
                {lang === "de" ? "Bildanalyse" : "Image analysis"}
              </button>
              <button
                onClick={handleStageAnalyze}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-6 py-2 text-sm text-white/80 hover:border-brand-cyan/30"
              >
                {lang === "de" ? "Stadien-Check" : "Stage check"}
              </button>
              {selectedEntry?.id && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-red/40 px-6 py-2 text-sm text-brand-red hover:bg-brand-red/10"
                >
                  <Trash2 className="icon-base icon-sm" />
                  {lang === "de" ? "Eintrag löschen" : "Delete entry"}
                </button>
              )}
            </div>

            {(aiError || aiResult) && (
              <div className="mt-4 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/5 p-4 text-sm text-brand-cyan">
                {aiError}
                {aiResult && (
                  <>
                    <p className="font-semibold uppercase tracking-[0.3em] text-white/60">
                      {lang === "de" ? "Analyse" : "Analysis"}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {aiResult.potentialIssues.map((issue) => (
                        <li key={issue.issue}>
                          <span className="font-medium text-white">{issue.issue}</span> · {issue.confidence}/{issue.explanation}
                        </li>
                      ))}
                    </ul>
                    {!!aiResult.recommendedActions.length && (
                      <div className="mt-2 space-y-1 text-white/80">
                        {aiResult.recommendedActions.map((action) => (
                          <p key={action}>• {action}</p>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-white/50">{aiResult.disclaimer}</p>
                  </>
                )}
              </div>
            )}

            {stageMessage && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                {stageMessage}
              </div>
            )}

            <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
              <button
                onClick={onClose}
                className="rounded-full border border-white/20 bg-black/30 px-6 py-2 text-sm text-white/70 hover:border-brand-cyan/30"
              >
                {lang === "de" ? "Schließen" : "Close"}
              </button>
              <button
                onClick={handleSave}
                className="rounded-full border border-grow-lime/40 bg-grow-lime/10 px-6 py-2 text-sm text-grow-lime hover:bg-grow-lime/20"
              >
                {lang === "de" ? "Speichern" : "Save entry"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
