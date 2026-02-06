import logo from "../assets/growmind-logo.svg";

const PRODUCTS = [
  {
    name: "Core A",
    tag: "Veg Base",
    description: "Stabiler N+Ca Kern fuer aggressive Veg-Phasen.",
  },
  {
    name: "Vector X",
    tag: "Transition",
    description: "Mehr Spurenelemente und Push fuer Stretch.",
  },
  {
    name: "Pulse BZ",
    tag: "Bloom",
    description: "PK Fokus fuer dichte, harzige Blueten.",
  },
];

export function BrandPromotionPanel() {
  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-6 shadow-neon">
      <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand-purple/20 blur-3xl" />
      <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-brand-cyan/20 blur-3xl" />
      <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="flex items-center gap-3">
            <img src={logo} alt="GrowMind" className="h-10 w-10" />
            <div>
              <p className="meta-mono text-[10px] text-white/50">BRAND SYSTEM</p>
              <h2 className="gradient-text mt-1 text-2xl font-light">GrowMind Nutrient Lab</h2>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/70">
            Premium Feed-Stack fuers Crop Steering. Formuliert fuer maximale Kontrolle, schnelle Drybacks und
            praezise EC-Targets.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-black/40 px-5 py-2 text-xs text-white/60">
              Shop kommt in Kuerze
            </span>
            <span className="text-xs text-white/50">Produktdatenblatt auf Anfrage</span>
          </div>
        </div>

        <div className="grid gap-3">
          {PRODUCTS.map((item) => (
            <div key={item.name} className="glass-card rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white">{item.name}</p>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-white/60">
                  {item.tag}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/60">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
