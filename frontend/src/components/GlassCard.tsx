import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface GlassCardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
  status?: "optimal" | "warning" | "critical";
  value?: number | null;
  min?: number | null;
  max?: number | null;
  alarm?: boolean;
  warnMarginRatio?: number;
  children: ReactNode;
}

type GlowState = "optimal" | "warning" | "alarm";

const computeState = (
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  alarm: boolean | undefined,
  warnMarginRatio: number
): GlowState => {
  if (alarm) return "alarm";
  if (value == null || !Number.isFinite(value)) return "alarm";
  if (min == null || max == null) return "optimal";

  if (value >= min && value <= max) return "optimal";

  const range = Math.max(Math.abs(max - min), Math.abs(max) || 1, 1);
  const margin = range * warnMarginRatio;
  if (value < min - margin || value > max + margin) return "alarm";
  return "warning";
};

export function GlassCard({
  title,
  subtitle,
  icon,
  rightSlot,
  className,
  status,
  value,
  min,
  max,
  alarm,
  warnMarginRatio = 0.1,
  children,
}: GlassCardProps) {
  const state = status
    ? status === "critical"
      ? "alarm"
      : status
    : computeState(value, min, max, alarm, warnMarginRatio);
  const blurClass = state === "warning" ? "backdrop-blur-xl" : "backdrop-blur-md";
  const glowClass =
    state === "alarm"
      ? "shadow-alarm-glow border-brand-red/50"
      : state === "warning"
      ? "shadow-warning-glow border-brand-orange/50 animate-pulse-glow"
      : "shadow-brand-glow border-brand-cyan/30";

  const borderColor =
    state === "alarm" ? "rgba(255,0,51,0.55)" : state === "warning" ? "rgba(255,122,0,0.55)" : "rgba(0,240,255,0.35)";

  return (
    <motion.section
      animate={{ borderColor }}
      transition={{ type: "tween", duration: 0.35, ease: "easeOut" }}
      layout={false}
      className={`glass-card ${blurClass} ${glowClass} relative overflow-hidden rounded-3xl border p-6 ${className ?? ""}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at top, rgba(0,240,255,0.18), transparent 55%), radial-gradient(circle at bottom, rgba(161,0,255,0.12), transparent 45%)",
        }}
      />
      {(title || subtitle || icon || rightSlot) && (
        <header className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {icon && (
              <div className={`rounded-2xl bg-white/5 p-3 ${state === "alarm" ? "text-brand-red" : state === "warning" ? "text-brand-orange" : "text-brand-cyan"} shadow-glass-inner`}>
                <div className="neon-icon">{icon}</div>
              </div>
            )}
            <div>
              {title && <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">{title}</h3>}
              {subtitle && <p className="mt-2 text-sm text-white/60">{subtitle}</p>}
            </div>
          </div>
          {rightSlot && <div className="relative">{rightSlot}</div>}
        </header>
      )}
      <div className="relative mt-6">{children}</div>
    </motion.section>
  );
}
