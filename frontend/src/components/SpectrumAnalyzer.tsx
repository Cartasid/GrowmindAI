import { motion } from "framer-motion";
import { useMemo } from "react";

import { useLightingEngine } from "../hooks/useLightingEngine";

const SEGMENTS = [
  {
    key: "blue" as const,
    label: "Blue",
    color: "#2FE6FF",
    sensor: "sensor.crop_blau_licht",
    unit: "%"
  },
  {
    key: "red" as const,
    label: "Red",
    color: "#FF3B5C",
    sensor: "sensor.crop_rot_licht",
    unit: "%"
  },
  {
    key: "far_red" as const,
    label: "Far Red",
    color: "#7A0014",
    sensor: "sensor.crop_far_red_licht",
    unit: "%"
  },
  {
    key: "uva" as const,
    label: "UVA",
    color: "#6C5BFF",
    sensor: "sensor.crop_uva_lichtstunden",
    unit: "h"
  },
  {
    key: "boost" as const,
    label: "Boost",
    color: "#FF8A3D",
    sensor: "sensor.crop_flower_boost_licht",
    unit: "%"
  }
];

const TARGET_MAPPING: Record<string, { label: string; color: string }> = {
  blue_pct: { label: "Blue", color: "#2FE6FF" },
  red_pct: { label: "Red", color: "#FF3B5C" },
  boost_pct: { label: "Boost", color: "#FF8A3D" }
};

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } }
};

export function SpectrumAnalyzer() {
  const { lightingEngine, status, connectionStatus } = useLightingEngine();

  const targetEntries = Object.entries(lightingEngine.target_spectrum ?? {});
  const hasTargets = targetEntries.some(([key]) => Boolean(TARGET_MAPPING[key]));

  const totalActual = useMemo(() => {
    const sum = SEGMENTS.reduce((acc, segment) => acc + (lightingEngine.current_spectrum[segment.key] || 0), 0);
    return sum > 0 ? sum : 1;
  }, [lightingEngine.current_spectrum]);

  const dominantSegment = useMemo(() => {
    return SEGMENTS.reduce((prev, segment) => {
      const value = lightingEngine.current_spectrum[segment.key] || 0;
      return value > (lightingEngine.current_spectrum[prev.key] || 0) ? segment : prev;
    }, SEGMENTS[0]);
  }, [lightingEngine.current_spectrum]);

  const glowColor = `${dominantSegment.color}55`;

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6"
    >
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Lighting Engine</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Spectrum Analyzer</h2>
        </div>
        <div className="brand-chip normal-case text-[10px]">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              status === "ready" ? "bg-brand-cyan shadow-brand-glow animate-glow" : "bg-white/40"
            }`}
          />
          {connectionStatus === "reconnecting"
            ? "Reconnecting"
            : connectionStatus === "error"
            ? "Verbindung fehlerhaft"
            : status === "ready"
            ? "Live Feed"
            : "Synchronisiere"}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mt-6">
        <div className="relative overflow-hidden rounded-full border border-white/10 bg-black/40 p-1">
          <div
            className={`absolute inset-0 opacity-90 ${lightingEngine.autopilot ? "animate-glow" : ""}`}
            style={{
              background:
                "linear-gradient(135deg, rgba(47,230,255,0.22) 0%, rgba(108,91,255,0.16) 100%)",
              boxShadow: `0 0 50px ${glowColor}, inset 0 0 60px rgba(255,255,255,0.02)`,
            }}
          />

          <div className="relative flex h-6 sm:h-7 w-full overflow-hidden rounded-full">
            {SEGMENTS.map((segment) => {
              const value = lightingEngine.current_spectrum[segment.key] || 0;
              const percent = (value / totalActual) * 100;
              return (
                <motion.div
                  key={segment.key}
                  className="h-full"
                  style={{ backgroundColor: segment.color }}
                  animate={{ width: `${percent}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 25 }}
                />
              );
            })}
          </div>

          {Object.entries(lightingEngine.target_spectrum).map(([key, rawValue]) => {
            const mapping = TARGET_MAPPING[key];
            if (!mapping) return null;
            const value = typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
            const clamped = Math.max(0, Math.min(100, value));
            return (
              <div key={key} className="absolute inset-y-0 flex items-center" style={{ left: `${clamped}%` }}>
                <div className="h-8 w-[2px] -translate-x-1/2 rounded-full" style={{ background: `${mapping.color}AA` }} />
              </div>
            );
          })}
        </div>

        <div className="mt-6 space-y-4 text-sm">
          <motion.div variants={fadeUp}>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Actual</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SEGMENTS.map((segment) => {
                const value = lightingEngine.current_spectrum[segment.key] || 0;
                return (
                  <motion.div
                    key={segment.key}
                    variants={fadeUp}
                    className="glass-card flex items-center justify-between rounded-2xl px-4 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                      <div>
                        <span className="text-white/80">{segment.label}</span>
                        <p className="text-[11px] text-white/40">{segment.sensor}</p>
                      </div>
                    </div>
                    <span className="font-medium text-white">
                      {value.toFixed(segment.unit === "h" ? 1 : 0)} {segment.unit}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Target</p>
            {hasTargets ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {targetEntries.map(([key, rawValue]) => {
                  const mapping = TARGET_MAPPING[key];
                  if (!mapping) return null;
                  const value = typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
                  return (
                    <motion.div
                      key={key}
                      variants={fadeUp}
                      className="glass-card flex items-center justify-between rounded-2xl px-4 py-2"
                    >
                      <div className="flex items-center gap-2 text-white/70">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: `${mapping.color}66` }} />
                        {mapping.label}
                      </div>
                      <span className="font-semibold text-white">{value.toFixed(0)}%</span>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/50">Keine Zielwerte konfiguriert.</p>
            )}
          </motion.div>
        </div>
      </motion.div>
    </motion.section>
  );
}
