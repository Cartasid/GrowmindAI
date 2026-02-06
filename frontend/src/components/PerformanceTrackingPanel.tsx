import type { JournalEntry } from "../types";

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export function PerformanceTrackingPanel({ entries }: { entries: JournalEntry[] }) {
  const harvests = entries.filter((entry) => entry.entryType === "Harvest" && entry.harvestDetails);
  const totalDry = harvests.reduce((sum, entry) => sum + (entry.harvestDetails?.dryWeight || 0), 0);
  const totalWet = harvests.reduce((sum, entry) => sum + (entry.harvestDetails?.wetWeight || 0), 0);
  const totalTrim = harvests.reduce((sum, entry) => sum + (entry.harvestDetails?.trimWeight || 0), 0);
  const avgQuality = harvests.length
    ? harvests.reduce((sum, entry) => sum + (entry.harvestDetails?.qualityRating || 0), 0) / harvests.length
    : 0;
  const avgDensity = harvests.length
    ? harvests.reduce((sum, entry) => sum + (entry.harvestDetails?.densityRating || 0), 0) / harvests.length
    : 0;
  const resinCounts = harvests.reduce(
    (acc, entry) => {
      const value = entry.harvestDetails?.resinProduction;
      if (value) acc[value] += 1;
      return acc;
    },
    { Low: 0, Medium: 0, High: 0 }
  );

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-white/50">Performance</p>
        <h2 className="gradient-text mt-1 text-2xl font-light">Yield & Quality</h2>
        <p className="mt-2 text-sm text-white/60">Auswertung der Harvest-Daten im Journal.</p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card rounded-2xl px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Dry Yield</p>
          <p className="mt-2 text-2xl text-white">{round(totalDry, 1)} g</p>
          <p className="text-xs text-white/50">Wet: {round(totalWet, 1)} g</p>
        </div>
        <div className="glass-card rounded-2xl px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Trim</p>
          <p className="mt-2 text-2xl text-white">{round(totalTrim, 1)} g</p>
          <p className="text-xs text-white/50">Harvests: {harvests.length}</p>
        </div>
        <div className="glass-card rounded-2xl px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Quality</p>
          <p className="mt-2 text-2xl text-white">{harvests.length ? round(avgQuality, 1) : "—"}</p>
          <p className="text-xs text-white/50">Density: {harvests.length ? round(avgDensity, 1) : "—"}</p>
        </div>
        <div className="glass-card rounded-2xl px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Resin</p>
          <p className="mt-2 text-sm text-white/70">High: {resinCounts.High}</p>
          <p className="text-sm text-white/70">Medium: {resinCounts.Medium}</p>
          <p className="text-sm text-white/70">Low: {resinCounts.Low}</p>
        </div>
      </div>
    </section>
  );
}
