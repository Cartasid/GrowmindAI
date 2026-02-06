import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

type TopDressItem = {
  key: string;
  name: string;
  amount: number;
  unit?: string;
  instruction?: string;
};

type MixingInstructionsPanelProps = {
  mix?: Record<string, number> | null;
  ppm?: Record<string, number> | null;
  reservoirLiters?: number;
  topDress?: TopDressItem[] | null;
};

const MIX_LABELS: Record<string, { label: string; unit: string }> = {
  part_a: { label: "Part A", unit: "g" },
  part_b: { label: "Part B", unit: "g" },
  part_c: { label: "Part C", unit: "g" },
  burst: { label: "Burst", unit: "g" },
  kelp: { label: "Kelp", unit: "g" },
  amino: { label: "Amino", unit: "g" },
  fulvic: { label: "Fulvic", unit: "g" },
  shield: { label: "Shield", unit: "g" },
};

const MIX_ORDER = ["part_a", "part_b", "part_c", "burst", "kelp", "amino", "fulvic"] as const;

const ppmKeys = ["N", "P", "K", "Ca", "Mg", "S", "Na", "Fe", "B", "Mo", "Mn", "Zn", "Cu", "Cl"] as const;

const buildNpkRatio = (ppm: Record<string, number> | null | undefined) => {
  if (!ppm) return "—";
  const n = ppm.N ?? 0;
  const p = ppm.P ?? 0;
  const k = ppm.K ?? 0;
  const values = [n, p, k].filter((value) => value > 0);
  if (!values.length) return "—";
  const divisor = Math.min(...values);
  if (divisor <= 0) return "—";
  return `${(n / divisor).toFixed(1)}:${(p / divisor).toFixed(1)}:${(k / divisor).toFixed(1)}`;
};

export function MixingInstructionsPanel({ mix, ppm, reservoirLiters, topDress }: MixingInstructionsPanelProps) {
  const [open, setOpen] = useState(false);
  const steps = useMemo(() => {
    if (!mix) return [];
    return MIX_ORDER.filter((key) => (mix?.[key] ?? 0) > 0).map((key) => ({
      key,
      amount: mix?.[key] ?? 0,
      label: MIX_LABELS[key]?.label ?? key,
      unit: MIX_LABELS[key]?.unit ?? "g",
    }));
  }, [mix]);

  const extraMix = useMemo(() => {
    if (!mix) return [];
    return Object.entries(mix)
      .filter(([key, value]) => !MIX_ORDER.includes(key as (typeof MIX_ORDER)[number]) && value > 0)
      .map(([key, value]) => ({
        key,
        amount: value,
        label: MIX_LABELS[key]?.label ?? key,
        unit: MIX_LABELS[key]?.unit ?? "g",
      }));
  }, [mix]);

  const allSteps = [...steps, ...extraMix];
  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Mixing</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Mischanleitung</h2>
          <p className="mt-2 text-sm text-white/60">Reihenfolge, Mengen und Checks fuer den Tank.</p>
        </div>
        <ChevronDown className={`icon-base icon-md text-white/60 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-4 text-sm text-white/70">
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Vorbereitung</p>
            <p className="mt-2">
              Tank halb fuellen, Wasserprofil pruefen, EC/pH Basis notieren.{" "}
              {reservoirLiters ? `Reservoir: ${reservoirLiters} L.` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Reihenfolge</p>
            {allSteps.length ? (
              <ol className="mt-2 space-y-2">
                {allSteps.map((item, index) => (
                  <li key={item.key}>
                    {index + 1}. {item.label} einruhren ({item.amount.toFixed(2)} {item.unit})
                  </li>
                ))}
                <li>{allSteps.length + 1}. Nachmessen und EC/pH feinjustieren</li>
              </ol>
            ) : (
              <p className="mt-2 text-white/60">Noch keine Mischung berechnet.</p>
            )}
          </div>
          {topDress && topDress.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Top-Dress</p>
              <ul className="mt-2 space-y-1">
                {topDress.map((item) => (
                  <li key={item.key}>
                    {item.name}: {item.amount.toFixed(2)} {item.unit || "g"}
                    {item.instruction ? ` · ${item.instruction}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ppm && (
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">PPM Profil</p>
                <span className="text-xs text-white/60">NPK {buildNpkRatio(ppm)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {ppmKeys.map((key) => (
                  <div key={key} className="rounded-xl border border-white/10 bg-black/40 px-2 py-1">
                    <p className="text-[10px] text-white/40">{key}</p>
                    <span className="text-sm text-white/90">{(ppm?.[key] ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Checks</p>
            <p className="mt-2">Nach 10 Minuten Ruehrzeit erneut messen und dokumentieren.</p>
          </div>
        </div>
      )}
    </section>
  );
}
