import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { AiAnalysisResponse, AnalyzerInputs, Language } from "../types";
import { analyzePlantImage } from "../services/aiService";
import { useToast } from "./ToastProvider";

const MAX_PHOTOS = 4;

export function PlantAnalyzerPanel({ lang = "de" }: { lang?: Language }) {
  const [images, setImages] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState("Early Veg");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const previewUrls = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList).slice(0, MAX_PHOTOS);
    setImages(next);
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!images.length) {
      setError(lang === "de" ? "Bitte zuerst Bilder hochladen." : "Please upload images first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const inputs: AnalyzerInputs = {};
      const response = await analyzePlantImage(images, inputs, phase, notes, lang);
      if (!response.ok) {
        setError(response.error.message);
        addToast({ title: "KI Analyse fehlgeschlagen", description: response.error.message, variant: "error" });
      } else {
        setResult(response.data);
        addToast({ title: "KI Analyse fertig", variant: "success" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "KI Analyse fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">AI Vision</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">KI Bildanalyse</h2>
          <p className="mt-2 text-sm text-white/60">AI-Check fuer Schaeden, Stress und Nährstoffmangel.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">Gemini</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <label className="text-sm text-white/70">
            Phase
            <input
              value={phase}
              onChange={(event) => setPhase(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
            />
          </label>
          <label className="text-sm text-white/70">
            Notizen
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
            />
          </label>
          <label className="inline-flex cursor-pointer flex-col rounded-2xl border border-dashed border-brand-cyan/30 bg-black/30 px-6 py-4 text-center text-white/70 hover:border-brand-cyan/60">
            <span className="text-sm font-medium">{lang === "de" ? "Bilder hochladen" : "Upload images"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
            <span className="mt-2 text-xs text-white/40">Max {MAX_PHOTOS} Bilder</span>
          </label>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-6 py-3 text-sm text-brand-cyan shadow-brand-glow transition hover:border-brand-cyan/70 hover:bg-brand-cyan/20"
          >
            {loading ? "Analysiere..." : (
              <>
                <Sparkles className="icon-base icon-sm" />
                {lang === "de" ? "KI Analyse starten" : "Run analysis"}
              </>
            )}
          </button>
          {error && (
            <div className="rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {previewUrls.map((url) => (
              <div key={url} className="glass-card rounded-2xl p-2">
                <img src={url} alt="preview" className="h-32 w-full rounded-xl object-cover" />
              </div>
            ))}
          </div>

          {result && (
            <div className="rounded-2xl border border-brand-cyan/20 bg-brand-cyan/5 p-4 text-sm text-brand-cyan">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Analyse</p>
              <ul className="mt-3 space-y-2 text-white/90">
                {result.potentialIssues.map((issue) => (
                  <li key={issue.issue}>
                    <span className="font-semibold text-white">{issue.issue}</span> · {issue.confidence}
                    <p className="text-xs text-white/60">{issue.explanation}</p>
                  </li>
                ))}
              </ul>
              {result.recommendedActions.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Empfehlungen</p>
                  <ul className="mt-2 space-y-1 text-white/80">
                    {result.recommendedActions.map((action) => (
                      <li key={action}>• {action}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-xs text-white/50">{result.disclaimer}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
