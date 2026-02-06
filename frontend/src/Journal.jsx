import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, ChevronDown } from "lucide-react";

import { useJournal } from "./hooks/useJournal";
import { useHaEntity } from "./hooks/useHaEntity";
import { JournalModal } from "./components/JournalModal";

const coerceDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "unknown" || trimmed === "unavailable") return null;

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const daysSince = (startDate, currentDate) => {
  if (!startDate || !currentDate) return 0;
  const diff = currentDate.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

const fmt = (value, digits = 2) => {
  const num = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(digits);
};

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } }
};

const ImageWithOverlay = ({ src, overlayText }) => {
  return (
    <div className="scan-frame tactical-grid glass-card relative overflow-hidden rounded-2xl p-3">
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={src}
          alt="journal"
          className="h-40 w-full rounded-xl object-cover opacity-95 sm:h-56"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        <div className="absolute right-3 top-3 rounded-md border border-brand-cyan/30 bg-black/60 px-3 py-2 shadow-brand-glow">
          <p className="meta-mono text-[10px] text-brand-cyan neon-icon">{overlayText}</p>
        </div>
      </div>
    </div>
  );
};

export default function Journal({ growId = "default", lang = "de", phase = "Vegetative" }) {
  const { entries } = useJournal(growId);
  const [expandedId, setExpandedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const growStart = useHaEntity("input_datetime.grow_start_date", 30);
  const growStartDate = useMemo(() => coerceDate(growStart.raw?.state), [growStart.raw?.state]);

  const sortedEntries = useMemo(() => {
    return [...(entries || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries]);

  return (
    <motion.section
      className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6 lg:p-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-mono text-xs text-white/50">Research Log</p>
          <h2 className="gradient-text mt-3 text-2xl font-light">JOURNAL</h2>
          <p className="meta-mono mt-4 text-[11px] text-white/40">
            {lang === "de" ? "Grow Start" : "Grow start"}: {growStartDate ? growStartDate.toLocaleString() : "—"}
          </p>
        </div>

        <button
          className="group relative w-full overflow-hidden rounded-2xl border border-brand-cyan/35 bg-black/40 px-5 py-3 text-left shadow-brand-glow transition hover:border-brand-cyan/60 sm:w-auto"
          onClick={() => setModalOpen(true)}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(135deg, rgba(47,230,255,0.18) 0%, rgba(108,91,255,0.16) 100%)",
            }}
          />
          <div className="relative flex items-center gap-3">
            <span className="rounded-xl bg-black/40 p-2 shadow-glass-inner">
              <Plus className="icon-base icon-md neon-icon text-brand-cyan" />
            </span>
            <div>
              <p className="meta-mono text-[10px] text-white/50">TACTICAL SWITCH</p>
              <p className="meta-mono mt-1 text-xs text-white/80">
                {lang === "de" ? "Add Entry" : "Add entry"}
              </p>
            </div>
          </div>
        </button>
      </motion.div>

      <motion.div variants={staggerContainer} className="mt-8 space-y-6">
        {sortedEntries.length === 0 ? (
          <motion.div variants={fadeUp} className="glass-card rounded-3xl p-6">
            <p className="meta-mono text-[11px] text-white/50">NO ENTRIES</p>
            <p className="mt-4 text-sm text-white/70">
              {lang === "de" ? "Noch keine Journal-Einträge vorhanden." : "No journal entries yet."}
            </p>
          </motion.div>
        ) : (
          sortedEntries.map((entry) => {
            const entryDate = coerceDate(entry.date) || new Date(entry.date);
            const dayIndex = growStartDate ? daysSince(growStartDate, entryDate) : 0;
            const isExpanded = expandedId === entry.id;

            const overlayText = `VPD:${fmt(entry.metrics?.vpd, 2)} | EC:${fmt(entry.metrics?.ec, 2)} | DAY:${dayIndex}`;

            return (
              <motion.article
                key={entry.id}
                variants={fadeUp}
                className="glass-card tactical-grid rounded-3xl p-6"
              >
                <button
                  onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div>
                    <p className="meta-mono text-[11px] text-white/50">DAY +{dayIndex}</p>
                    <h3 className="mt-2 text-lg font-semibold text-white/90">
                      {entry.entryType} · <span className="text-white/60">{entry.priority}</span>
                    </h3>
                    <p className="meta-mono mt-3 text-[11px] text-white/40">{entryDate.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="meta-mono text-[11px] text-brand-cyan neon-icon">
                      VPD {fmt(entry.metrics?.vpd, 2)}
                    </span>
                    <ChevronDown
                      className={`icon-base icon-md text-white/60 transition ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="wipe-in mt-6 space-y-6">
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                      <p className="meta-mono text-[10px] text-white/50">LOG</p>
                      <p className="mt-3 text-sm leading-relaxed text-white/80">
                        {entry.notes?.trim() ? entry.notes : "—"}
                      </p>
                    </div>

                    {Array.isArray(entry.images) && entry.images.length > 0 ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {entry.images.slice(0, 2).map((img) => (
                          <ImageWithOverlay key={img} src={img} overlayText={overlayText} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                        <p className="meta-mono text-[10px] text-white/50">IMAGING</p>
                        <p className="mt-2 text-sm text-white/60">
                          {lang === "de" ? "Keine Fotos angehängt." : "No photos attached."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.article>
            );
          })
        )}
      </motion.div>

      <JournalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        growId={growId}
        lang={lang}
        phase={phase}
      />
    </motion.section>
  );
}
