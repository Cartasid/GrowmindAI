import { useMemo, useState } from "react";
import type { JournalEntry, Phase } from "../types";

export function PhotoGallery({ entries, onSelect }: { entries: JournalEntry[]; onSelect: (entry: JournalEntry) => void }) {
  const [phase, setPhase] = useState<Phase | "all">("all");
  const [aiOnly, setAiOnly] = useState(false);

  const availablePhases = useMemo(() => {
    const set = new Set<Phase>();
    entries.forEach((entry) => set.add(entry.phase));
    return Array.from(set);
  }, [entries]);

  const images = useMemo(() => {
    return entries.flatMap((entry) =>
      entry.images.map((image) => ({
        entry,
        image,
      }))
    );
  }, [entries]);

  const filtered = useMemo(() => {
    return images.filter((item) => {
      if (phase !== "all" && item.entry.phase !== phase) return false;
      if (aiOnly && !item.entry.aiAnalysisResult) return false;
      return true;
    });
  }, [images, phase, aiOnly]);

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Gallery</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Photo Gallery</h2>
          <p className="mt-2 text-sm text-white/60">Filter nach Phase oder KI-Analyse.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={phase}
          onChange={(event) => setPhase(event.target.value as Phase | "all")}
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
        >
          <option value="all" className="bg-[#070a16]">Alle Phasen</option>
          {availablePhases.map((value) => (
            <option key={value} value={value} className="bg-[#070a16]">
              {value}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/70">
          <input type="checkbox" checked={aiOnly} onChange={(event) => setAiOnly(event.target.checked)} />
          Nur mit KI-Analyse
        </label>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length ? (
          filtered.map((item) => (
            <button
              key={`${item.entry.id}-${item.image}`}
              onClick={() => onSelect(item.entry)}
              className="glass-card rounded-2xl p-2"
            >
              <img src={item.image} alt="journal" className="h-36 w-full rounded-xl object-cover" />
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-6 text-sm text-white/60">
            Keine Bilder vorhanden.
          </div>
        )}
      </div>
    </section>
  );
}
