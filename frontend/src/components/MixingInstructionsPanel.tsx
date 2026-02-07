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

export function MixingInstructionsPanel({ mix, ppm, reservoirLiters, topDress, descriptions }: MixingInstructionsPanelProps) {
  const [open, setOpen] = useState(false);
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
              Tank 70-80 % mit Wasser (18-22 C) fuellen, kraeftige Umwaelzung an.
              {reservoirLiters ? ` Reservoir: ${reservoirLiters} L.` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">pH anpassen</p>
            <p className="mt-2 text-white/70">
              Nie Pulver direkt in den Ansaugwirbel streuen. Erst 1-2 L Becher mit Tankwasser fuellen,
              Schlaemme anruehren, dann am Gegenstrom einlaufen lassen.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Reihenfolge - Veg (A + B)</p>
            <ol className="mt-2 space-y-2">
              <li>B (VECTOR) in 3 Portionen: einruehren, 60-90 s klaeren lassen.</li>
              <li>Helix, Ligand, Tide zugeben.</li>
              <li>A (CORE) in 2 Portionen, langsam. 2 min mischen, klaeren lassen.</li>
              <li>Auf Endvolumen. EC & pH pruefen (Coco/RW: 5.8-6.0; Erde: 6.2-6.5).</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Reihenfolge - Bluete (A + C + BURST)</p>
            <ol className="mt-2 space-y-2">
              <li>C (PULSE) in 3 Portionen vollstaendig loesen.</li>
              <li>BURST (PK) in 2 Portionen loesen.</li>
              <li>Helix, Ligand, Tide zugeben.</li>
              <li>A (CORE) zuletzt, langsam in 2 Portionen.</li>
              <li>Auf Endvolumen. EC & pH pruefen.</li>
            </ol>
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
            <p className="mt-2">
              Zwischen Komponenten je 60-120 s warten, bis klar. Nach A: 2-3 min laufen lassen,
              dann EC stabil ablesen.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
