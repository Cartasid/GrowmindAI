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
  descriptions?: Record<string, string>;
};

const MIX_LABELS: Record<string, { label: string; unit: string }> = {
  part_a: { label: "Part A", unit: "g" },
  part_b: { label: "Part B", unit: "g" },
  part_c: { label: "Part C", unit: "g" },
  burst: { label: "Burst", unit: "g" },
  kelp: { label: "Kelp", unit: "g" },
  amino: { label: "Amino", unit: "g" },
  fulvic: { label: "Fulvic", unit: "g" },
  shield: { label: "Silicate / Hypo", unit: "g" },
  quench: { label: "Quench", unit: "g" },
};

const MIX_ORDER = ["part_a", "part_b", "part_c", "burst", "kelp", "amino", "fulvic", "quench"] as const;

export function MixingInstructionsPanel({ mix, ppm, reservoirLiters, topDress, descriptions }: MixingInstructionsPanelProps) {
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
                  <li key={item.key} title={descriptions?.[item.key]}>
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
                  <li key={item.key} title={descriptions?.[item.key]}>
                    {item.name}: {item.amount.toFixed(2)} {item.unit || "g"}
                    {item.instruction ? ` · ${item.instruction}` : ""}
                  </li>
                ))}
              </ul>
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
