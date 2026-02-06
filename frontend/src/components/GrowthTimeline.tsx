import type { JournalEntry } from "../types";

const entryLabels: Record<JournalEntry["entryType"], string> = {
  Observation: "OBS",
  Feeding: "FED",
  Pest: "PEST",
  Training: "TRN",
  Harvest: "HRV",
};

export function GrowthTimeline({ entries, onSelect }: { entries: JournalEntry[]; onSelect: (entry: JournalEntry) => void }) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const start = new Date(sorted[0].date).getTime();
  const end = new Date(sorted[sorted.length - 1].date).getTime();
  const span = Math.max(1, end - start);

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Timeline</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Growth Timeline</h2>
          <p className="mt-2 text-sm text-white/60">Journal-Eintraege entlang der Grow-Dauer.</p>
        </div>
      </div>

      <div className="mt-6 rounded-full border border-white/10 bg-black/40 px-4 py-6">
        <div className="relative h-6">
          {sorted.map((entry) => {
            const pos = ((new Date(entry.date).getTime() - start) / span) * 100;
            return (
              <button
                key={entry.id}
                onClick={() => onSelect(entry)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[10px] text-white/80 hover:border-brand-cyan/50"
                style={{ left: `${pos}%`, top: "50%" }}
              >
                {entryLabels[entry.entryType]}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
