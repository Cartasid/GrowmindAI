import React, { useMemo, useState } from "react";

const formatNumber = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(digits);
};

const daysSince = (startDate, date) => {
  try {
    const start = new Date(startDate);
    const current = new Date(date);
    const diff = current.getTime() - start.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
};

const getLightPhase = (phase) => {
  const normalized = String(phase || "").toLowerCase();
  if (normalized.includes("veg")) return "VEG";
  if (normalized.includes("flower") || normalized.includes("bloom") || normalized.includes("blüte")) return "FLOWER";
  if (normalized.includes("rip")) return "RIPEN";
  return String(phase || "—").toUpperCase();
};

const pickInsight = (ai) => {
  if (!ai) return null;
  if (Array.isArray(ai.potentialIssues) && ai.potentialIssues.length) {
    const top = ai.potentialIssues[0];
    return `${top.issue} · ${top.confidence}`;
  }
  if (typeof ai.disclaimer === "string" && ai.disclaimer.trim()) {
    return ai.disclaimer.trim();
  }
  return null;
};

const TacticalBadge = ({ label, value }) => {
  return (
    <div className="glass-card rounded-xl px-3 py-2">
      <p className="meta-mono text-[10px] text-white/50">{label}</p>
      <p className="meta-mono mt-1 text-xs text-brand-cyan neon-icon">{value}</p>
    </div>
  );
};

const TimelineMarker = ({ dayIndex, isActive }) => {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`h-3 w-3 rounded-full border ${
          isActive ? "border-brand-cyan bg-brand-cyan/30 shadow-brand-glow" : "border-white/15 bg-white/5"
        }`}
      />
      <div className="mt-2 h-14 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
      <span className="meta-mono mt-2 text-[10px] text-white/40">D+{dayIndex}</span>
    </div>
  );
};

const PhotoPanel = ({ src, overlay }) => {
  return (
    <div className="scan-frame tactical-grid glass-card rounded-2xl p-3">
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={src}
          alt="journal"
          className="h-52 w-full rounded-xl object-cover opacity-95"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        <div className="absolute bottom-3 left-3 right-3 grid grid-cols-2 gap-2">
          {overlay.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-black/45 px-3 py-2">
              <p className="meta-mono text-[10px] text-white/50">{item.label}</p>
              <p className="meta-mono mt-1 text-xs text-white/80">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function AIJournal({ entries = [], growStartDate, title = "AI JOURNAL LOG" }) {
  const [expandedId, setExpandedId] = useState(null);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries]);

  const startDate = growStartDate || (sortedEntries.length ? sortedEntries[sortedEntries.length - 1].date : new Date().toISOString());

  return (
    <section className="glass-panel tactical-grid relative rounded-3xl p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-mono text-xs text-white/50">GrowMind Tactical Journal</p>
          <h2 className="gradient-text mt-3 text-2xl font-light">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <TacticalBadge label="GROW START" value={new Date(startDate).toLocaleDateString()} />
          <TacticalBadge label="ENTRIES" value={String(sortedEntries.length).padStart(2, "0")} />
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[96px_1fr]">
        <aside className="hidden lg:flex flex-col items-center gap-10">
          {sortedEntries.map((entry) => {
            const dayIndex = daysSince(startDate, entry.date);
            return <TimelineMarker key={entry.id} dayIndex={dayIndex} isActive={expandedId === entry.id} />;
          })}
        </aside>

        <div className="space-y-6">
          {sortedEntries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const dayIndex = daysSince(startDate, entry.date);
            const lightPhase = getLightPhase(entry.phase);

            const overlayItems = [
              { label: "VPD", value: `${formatNumber(entry.metrics?.vpd, 2)} kPa` },
              { label: "VWC", value: `${formatNumber(entry.metrics?.vwc, 1)} %` },
              { label: "EC", value: formatNumber(entry.metrics?.ec, 2) },
              { label: "LIGHT", value: lightPhase },
            ];

            const insight = pickInsight(entry.aiAnalysisResult);

            return (
              <div key={entry.id} className="relative">
                <button
                  className={`glass-card tactical-grid w-full rounded-3xl p-6 text-left transition hover:border-brand-cyan/40 ${
                    isExpanded ? "border-brand-cyan/40 shadow-brand-glow" : ""
                  }`}
                  onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="meta-mono text-[11px] text-white/50">DAY +{dayIndex}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white/90">
                        {entry.entryType} · <span className="text-white/60">{entry.priority}</span>
                      </h3>
                      <p className="meta-mono mt-3 text-[11px] text-white/40">
                        {new Date(entry.date).toLocaleString()} · PHASE {lightPhase}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2">
                        <span className="meta-mono text-[11px] text-white/60">VPD</span>
                        <span className="meta-mono ml-3 text-[11px] text-brand-cyan neon-icon">
                          {formatNumber(entry.metrics?.vpd, 2)}
                        </span>
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2">
                        <span className="meta-mono text-[11px] text-white/60">VWC</span>
                        <span className="meta-mono ml-3 text-[11px] text-brand-cyan neon-icon">
                          {formatNumber(entry.metrics?.vwc, 1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {insight && (
                    <div className="mt-5 rounded-2xl border border-brand-cyan/25 bg-black/25 px-5 py-4">
                      <p className="meta-mono text-[10px] text-white/50">AI INSIGHTS</p>
                      <p className="mt-2 text-sm text-white/85">{insight}</p>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="wipe-in mt-6 space-y-6">
                      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="space-y-4">
                          <p className="meta-mono text-[10px] text-white/50">OBSERVATION LOG</p>
                          <p className="text-sm leading-relaxed text-white/80">
                            {entry.notes?.trim() ? entry.notes : "—"}
                          </p>

                          {entry.aiAnalysisResult?.recommendedActions?.length ? (
                            <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-4">
                              <p className="meta-mono text-[10px] text-white/50">RECOMMENDED ACTIONS</p>
                              <ul className="mt-3 space-y-2 text-sm text-white/80">
                                {entry.aiAnalysisResult.recommendedActions.slice(0, 4).map((action) => (
                                  <li key={action} className="flex gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-cyan shadow-brand-glow" />
                                    <span>{action}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-3">
                          <TacticalBadge label="TEMP" value={`${formatNumber(entry.metrics?.temp, 1)} °C`} />
                          <TacticalBadge label="RH" value={`${formatNumber(entry.metrics?.humidity, 0)} %`} />
                          <TacticalBadge label="PH" value={formatNumber(entry.metrics?.ph, 2)} />
                          <TacticalBadge label="PPFD" value={formatNumber(entry.metrics?.ppfd, 0)} />
                        </div>
                      </div>

                      {Array.isArray(entry.images) && entry.images.length ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                          {entry.images.slice(0, 2).map((img) => (
                            <PhotoPanel key={img} src={img} overlay={overlayItems} />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                          <p className="meta-mono text-[10px] text-white/50">IMAGING</p>
                          <p className="mt-2 text-sm text-white/60">No photos attached.</p>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
