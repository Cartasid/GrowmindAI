import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function MixingInstructionsPanel() {
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
          <p className="mt-2 text-sm text-white/60">Reihenfolge und Checks fuer den Tank.</p>
        </div>
        <ChevronDown className={`icon-base icon-md text-white/60 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-4 text-sm text-white/70">
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Vorbereitung</p>
            <p className="mt-2">Tank halb fuellen, Wasserprofil pruefen, EC/pH Basis notieren.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Reihenfolge</p>
            <ol className="mt-2 space-y-2">
              <li>1. Part A einruhren</li>
              <li>2. Part B/C einruhren</li>
              <li>3. Burst + Additive zugeben</li>
              <li>4. Nachmessen und EC/pH feinjustieren</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Checks</p>
            <p className="mt-2">Nach 10 Minuten Ruehrzeit erneut messen und dokumentieren.</p>
          </div>
        </div>
      )}
    </section>
  );
}
