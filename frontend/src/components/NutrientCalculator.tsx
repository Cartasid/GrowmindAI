import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import type { Cultivar, ManagedPlan, Substrate } from "../types";
import { useToast } from "./ToastProvider";
import {
  fetchInventory,
  fetchNutrientPlan,
  type InventoryResponse,
  type MixResponse,
} from "../services/nutrientService";
import { fetchActivePlan, fetchAvailablePlans, setActivePlan } from "../services/planService";

const CULTIVARS: { value: Cultivar; label: string }[] = [
  { value: "wedding_cake", label: "Wedding Cake" },
  { value: "blue_dream", label: "Blue Dream" },
  { value: "amnesia_haze", label: "Amnesia Haze" },
];

const SUBSTRATES: { value: Substrate; label: string }[] = [
  { value: "coco", label: "Coco" },
  { value: "soil", label: "Erde" },
  { value: "rockwool", label: "Steinwolle" },
];

type PlanInputs = {
  phase: string;
  reservoir: number;
};

const DEFAULT_INPUTS: PlanInputs = {
  phase: "Early Veg",
  reservoir: 100,
};

const MIX_ORDER = ["part_a", "part_b", "part_c", "burst", "kelp", "amino", "fulvic"] as const;
type ValueEvent = { target: { value: string } };
type TopDressItem = NonNullable<MixResponse["top_dress"]>[number];
type InventoryAlertItem = InventoryResponse["alerts"][number];

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } }
};

export function NutrientCalculator() {
  const [cultivar, setCultivar] = useState<Cultivar>("wedding_cake");
  const [substrate, setSubstrate] = useState<Substrate>("coco");
  const [inputs, setInputs] = useState<PlanInputs>({ ...DEFAULT_INPUTS });
  const [plans, setPlans] = useState<ManagedPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [result, setResult] = useState<MixResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    let active = true;
    setPlanLoading(true);
    setError(null);
    Promise.all([
      fetchAvailablePlans(cultivar, substrate),
      fetchActivePlan(cultivar, substrate),
    ])
      .then(([available, activePlan]) => {
        if (!active) return;
        setPlans(available);
        setActivePlanId(activePlan.planId);
        setSelectedPlanId(activePlan.planId);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) {
          setPlanLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cultivar, substrate]);

  useEffect(() => {
    let active = true;
    fetchInventory()
      .then((data) => {
        if (active) setInventory(data);
      })
      .catch(() => {
        if (active) setInventory(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedPlan = useMemo(() => {
    if (!plans.length) return null;
    return plans.find((plan: ManagedPlan) => plan.id === selectedPlanId) ?? plans[0];
  }, [plans, selectedPlanId]);

  const phaseOptions = useMemo(() => {
    if (!selectedPlan?.plan) return [DEFAULT_INPUTS.phase];
    const phases = selectedPlan.plan
      .map((entry: ManagedPlan["plan"][number]) => entry.phase)
      .filter(Boolean);
    return phases.length ? phases : [DEFAULT_INPUTS.phase];
  }, [selectedPlan]);

  useEffect(() => {
    if (!phaseOptions.includes(inputs.phase)) {
      setInputs((prev: PlanInputs) => ({ ...prev, phase: phaseOptions[0] }));
    }
  }, [phaseOptions, inputs.phase]);

  const handleInputChange = <K extends keyof PlanInputs>(key: K, value: PlanInputs[K]) => {
    setInputs((prev: PlanInputs) => ({ ...prev, [key]: value }));
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const response = await fetchNutrientPlan({
        current_week: inputs.phase,
        reservoir_liters: inputs.reservoir,
        cultivar,
        substrate,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      addToast({
        title: "Berechnung fehlgeschlagen",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setCalculating(false);
    }
  };

  const handleSetActivePlan = async () => {
    if (!selectedPlanId) return;
    try {
      const newActive = await setActivePlan(cultivar, substrate, selectedPlanId);
      setActivePlanId(newActive);
      addToast({ title: "Plan aktiviert", variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      addToast({
        title: "Plan konnte nicht aktiviert werden",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  return (
    <motion.section
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={fadeUp}
        className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-white/50">Nutrient Engine</p>
            <h2 className="gradient-text mt-2 text-2xl font-light">Nährstoffrechner</h2>
            <p className="mt-2 text-sm text-white/60">
              PhotonFlux Doser · dynamisch nach Phase, Trend und Wasserprofil
            </p>
          </div>
          <div className="brand-chip normal-case text-[10px]">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-cyan shadow-brand-glow animate-glow" />
            Live gekoppelt mit GrowMind-Plänen
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <motion.div variants={fadeUp} className="glass-panel rounded-3xl p-5 space-y-6 shadow-neon sm:p-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Setup</p>
            <div className="grid gap-4">
              <label className="text-sm text-white/70">
                Cultivar
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                  value={cultivar}
                  onChange={(event: ValueEvent) => setCultivar(event.target.value as Cultivar)}
                >
                  {CULTIVARS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#070a16]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-white/70">
                Substrat
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                  value={substrate}
                  onChange={(event: ValueEvent) => setSubstrate(event.target.value as Substrate)}
                >
                  {SUBSTRATES.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#070a16]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-white/70">
                Plan
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                  value={selectedPlanId}
                  onChange={(event: ValueEvent) => setSelectedPlanId(event.target.value)}
                  disabled={planLoading}
                >
                  {plans.map((plan: ManagedPlan) => (
                    <option key={plan.id} value={plan.id} className="bg-[#070a16]">
                      {plan.name} {plan.id === "default" ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!planLoading && plans.length === 0 && (
                <div className="rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-xs text-brand-red">
                  Keine Pläne verfügbar. Prüfe die API-Verbindung oder die Plan-Konfiguration.
                </div>
              )}
              {selectedPlan && (
                <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Plan-Info</p>
                  <p className="mt-2 text-white/80">{selectedPlan.description || "Kein Plan-Text hinterlegt."}</p>
                  {selectedPlanId !== activePlanId && (
                    <button
                      className="mt-3 rounded-full border border-brand-cyan/40 bg-black/40 px-4 py-1 text-xs text-brand-cyan shadow-brand-glow hover:border-brand-cyan/70 hover:bg-brand-cyan/20"
                      onClick={handleSetActivePlan}
                    >
                      Als aktiv setzen
                    </button>
                  )}
                  {selectedPlanId === activePlanId && (
                    <span className="mt-3 inline-flex rounded-full border border-grow-lime/30 bg-grow-lime/10 px-3 py-1 text-xs text-grow-lime">
                      Aktiver Plan
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Doser Input</p>
            <label className="text-sm text-white/70">
              Phase
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                value={inputs.phase}
                onChange={(event: ValueEvent) => handleInputChange("phase", event.target.value)}
              >
                {phaseOptions.map((phase: string) => (
                  <option key={phase} value={phase} className="bg-[#070a16]">
                    {phase}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-white/70">
              Reservoir (L)
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                type="number"
                min={1}
                step={1}
                value={inputs.reservoir}
                onChange={(event: ValueEvent) => handleInputChange("reservoir", Number(event.target.value) || 1)}
              />
            </label>
          </div>

          <button
            className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/15 px-5 py-3 text-sm text-brand-cyan shadow-brand-glow transition hover:border-brand-cyan/70 hover:bg-brand-cyan/25"
            onClick={handleCalculate}
            disabled={calculating}
          >
            {calculating ? "Berechne…" : "Dosis berechnen"}
          </button>

          {error && (
            <div className="rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
              {error}
            </div>
          )}
        </motion.div>

        <motion.div variants={fadeUp} className="space-y-6">
          <motion.div variants={fadeUp} className="glass-panel rounded-3xl p-5 shadow-neon sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Ergebnis</p>
            {result ? (
              <div className="mt-4 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{inputs.phase}</h3>
                    <p className="text-sm text-white/60">Tank {inputs.reservoir} L · Substrat {substrate}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/60">
                    Mix Preview
                  </span>
                </div>

                {result.top_dress && result.top_dress.length > 0 && (
                  <div className="rounded-2xl border border-brand-orange/40 bg-brand-orange/10 px-4 py-3 text-sm text-brand-orange">
                    <p className="text-xs uppercase tracking-[0.3em] text-brand-orange/70">Top Dress</p>
                    <div className="mt-2 space-y-2">
                      {result.top_dress.map((item: TopDressItem) => (
                        <div key={item.key} className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-white">{item.name}</p>
                            <p className="text-xs text-white/70">{item.instruction || "Nicht in den Tank mischen! Um den Stamm streuen."}</p>
                          </div>
                          <span className="text-white/90">
                            {item.amount.toFixed(2)} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-black/40 text-white/60">
                      <tr>
                        <th className="px-4 py-2 text-left">Komponente</th>
                        <th className="px-4 py-2 text-right">Menge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MIX_ORDER.filter((key) => key in result.mix).map((key) => {
                        const item = inventory?.inventory?.[key];
                        const unit = item?.unit || (key === "amino" || key === "fulvic" ? "ml" : "g");
                        const label = item?.name || key;
                        return (
                          <tr key={key} className="border-t border-white/5">
                            <td className="px-4 py-2 text-white">{label}</td>
                            <td className="px-4 py-2 text-right text-white/80">
                              {result.mix[key].toFixed(2)} {unit}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/60">
                Wähle Cultivar, Plan und Parameter – dann auf „Dosis berechnen“ klicken.
              </p>
            )}
          </motion.div>

          {inventory && (
            <motion.div variants={fadeUp} className="glass-panel rounded-3xl p-5 shadow-neon sm:p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Lagerbestand</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(Object.entries(inventory.inventory) as [string, InventoryResponse["inventory"][string]][]).map(
                  ([key, item]) => (
                    <div key={key} className="glass-card rounded-2xl px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{item.name || key}</p>
                      <p className="mt-2 text-lg text-white">
                        {item.current.toFixed(1)} {item.unit}
                        <span className="ml-2 text-xs text-white/40">/ {item.full_size.toFixed(1)} {item.unit}</span>
                      </p>
                      {item.description && <p className="mt-1 text-xs text-white/50">{item.description}</p>}
                    </div>
                  )
                )}
              </div>
              {inventory.alerts.length > 0 && (
                <div className="mt-6 rounded-2xl border border-brand-orange/40 bg-brand-orange/10 px-4 py-4 text-sm text-brand-orange">
                  <p className="text-xs uppercase tracking-[0.3em] text-brand-orange/70">Shopping List</p>
                  <ul className="mt-3 space-y-2">
                    {inventory.alerts.map((alert: InventoryAlertItem) => (
                      <li key={alert.key} className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-white">{alert.name}</p>
                          <p className="text-xs text-white/70">{alert.message}</p>
                        </div>
                        {alert.reorder_url && (
                          <a
                            className="text-xs text-brand-orange underline decoration-brand-orange/60 underline-offset-4"
                            href={alert.reorder_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Nachbestellen
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
