import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import type { Cultivar, ManagedPlan, PlanEntry, Substrate } from "../types";
import { useToast } from "./ToastProvider";
import {
  fetchInventory,
  fetchNutrientPlan,
  confirmNutrientMix,
  consumeInventory,
  type InventoryResponse,
  type MixResponse,
} from "../services/nutrientService";
import { optimizePlan } from "../services/aiService";
import { createPlan, fetchActivePlan, fetchAvailablePlans, fetchDefaultPlan, setActivePlan } from "../services/planService";
import { MixingInstructionsPanel } from "./MixingInstructionsPanel";
import { PlanOptimizerModal } from "./PlanOptimizerModal";

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
type EditablePlan = Omit<ManagedPlan, "id"> & { id?: string };

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } }
};

const ppmKeys = ["N", "P", "K", "Ca", "Mg", "S", "Na", "Fe", "B", "Mo", "Mn", "Zn", "Cu", "Cl"] as const;

const buildNpkRatio = (ppm: Record<string, number> | undefined) => {
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
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorPlan, setEditorPlan] = useState<EditablePlan | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activateAfterSave, setActivateAfterSave] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [inventoryInput, setInventoryInput] = useState<Record<string, string>>({});
  const { addToast } = useToast();

  useEffect(() => {
    let active = true;
    const loadPlans = async () => {
      setPlanLoading(true);
      setError(null);
      try {
        const available = await fetchAvailablePlans(cultivar, substrate);
        let activePlanId = "default";
        try {
          const activePlan = await fetchActivePlan(cultivar, substrate);
          activePlanId = activePlan.planId || "default";
        } catch (err) {
          if (active) {
            console.warn("Active plan fetch failed, using default", err);
          }
        }

        let nextPlans = available;
        if (!nextPlans.length) {
          const fallback = await fetchDefaultPlan(cultivar, substrate);
          nextPlans = [fallback];
          activePlanId = "default";
        }

        if (!active) return;
        setPlans(nextPlans);
        setActivePlanId(activePlanId);
        setSelectedPlanId(activePlanId);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) {
          setPlanLoading(false);
        }
      }
    };
    void loadPlans();

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

  const cloneEntries = (planEntries: PlanEntry[]) =>
    planEntries.map((entry) => ({
      ...entry,
      notes: entry.notes ? [...entry.notes] : undefined,
    }));

  const buildDraftFromPlan = (plan: ManagedPlan, overrides?: Partial<EditablePlan>): EditablePlan => ({
    id: undefined,
    name: plan.name,
    description: plan.description ?? "",
    plan: cloneEntries(plan.plan),
    waterProfile: { ...plan.waterProfile },
    osmosisShare: plan.osmosisShare,
    isDefault: false,
    ...overrides,
  });

  const mergeAiSuggestions = (
    base: PlanEntry[],
    suggestions: {
      phase: string;
      A: number;
      X: number;
      BZ: number;
      pH: string;
      EC: string;
      notes?: string;
      stage?: string;
    }[]
  ) =>
    suggestions.map((suggestion) => {
      const match = base.find((entry) => entry.phase === suggestion.phase);
      const notes = match?.notes ? [...match.notes] : [];
      if (suggestion.stage) {
        notes.unshift(suggestion.stage);
      }
      if (suggestion.notes) {
        notes.push(suggestion.notes);
      }
      return {
        phase: suggestion.phase,
        A: Number.isFinite(suggestion.A) ? suggestion.A : 0,
        X: Number.isFinite(suggestion.X) ? suggestion.X : 0,
        BZ: Number.isFinite(suggestion.BZ) ? suggestion.BZ : 0,
        pH: suggestion.pH ?? "",
        EC: suggestion.EC ?? "",
        durationDays: match?.durationDays ?? 7,
        Tide: match?.Tide,
        Helix: match?.Helix,
        Ligand: match?.Ligand,
        Silicate: match?.Silicate,
        SilicateUnit: match?.SilicateUnit,
        notes: notes.length ? notes : undefined,
      };
    });

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

  const handleConfirmMix = async () => {
    if (!result) return;
    setConfirming(true);
    try {
      const response = await confirmNutrientMix({
        current_week: inputs.phase,
        reservoir_liters: inputs.reservoir,
        cultivar,
        substrate,
      });
      setResult(response);
      setInventory({
        inventory: response.inventory,
        alerts: response.alerts,
        refill_needed: response.refill_needed,
      });
      addToast({ title: "Mix bestaetigt", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Mix bestaetigen fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setConfirming(false);
    }
  };

  const handleCreateDraft = () => {
    if (!selectedPlan) return;
    const draft = buildDraftFromPlan(selectedPlan, {
      name: "Neuer Plan",
      description: `Kopie von ${selectedPlan.name}`,
    });
    setEditorPlan(draft);
    setAiSummary(null);
    setShowEditor(true);
  };

  const handleGenerateAiPlan = async () => {
    if (!selectedPlan) return;
    setAiGenerating(true);
    setAiSummary(null);
    try {
      const waterProfile = { ...selectedPlan.waterProfile } as Record<string, number>;
      const response = await optimizePlan(
        selectedPlan.plan,
        "de",
        cultivar,
        substrate,
        waterProfile,
        selectedPlan.osmosisShare
      );
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      const aiPlanEntries = mergeAiSuggestions(selectedPlan.plan, response.data.plan);
      const draft = buildDraftFromPlan(selectedPlan, {
        name: `AI Plan ${selectedPlan.name}`,
        description: response.data.summary ?? "AI-generierter Plan basierend auf dem aktuellen Profil.",
        plan: aiPlanEntries,
      });
      setEditorPlan(draft);
      setAiSummary(response.data.summary ?? null);
      setShowEditor(true);
      addToast({ title: "AI-Plan bereit", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "AI-Plan fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleInventoryConsume = async (key: string) => {
    const raw = inventoryInput[key] ?? "";
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      addToast({ title: "Ungueltige Menge", description: "Bitte eine Zahl > 0 eingeben.", variant: "error" });
      return;
    }
    try {
      const response = await consumeInventory({ consumption: { [key]: value } });
      setInventory(response);
      setInventoryInput((prev) => ({ ...prev, [key]: "" }));
      addToast({ title: "Verbrauch gebucht", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Verbrauch fehlgeschlagen", description: message, variant: "error" });
    }
  };

  const handlePlanSave = async () => {
    if (!editorPlan) return;
    if (!editorPlan.name.trim()) {
      addToast({ title: "Name fehlt", description: "Bitte einen Plannamen vergeben.", variant: "error" });
      return;
    }
    setPlanSaving(true);
    try {
      const saved = await createPlan(cultivar, substrate, editorPlan);
      const available = await fetchAvailablePlans(cultivar, substrate);
      setPlans(available);
      setSelectedPlanId(saved.id);
      if (activateAfterSave) {
        const activeId = await setActivePlan(cultivar, substrate, saved.id);
        setActivePlanId(activeId);
      }
      setShowEditor(false);
      addToast({ title: "Plan gespeichert", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Plan speichern fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setPlanSaving(false);
    }
  };

  const updateDraftField = <K extends keyof EditablePlan>(key: K, value: EditablePlan[K]) => {
    setEditorPlan((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateEntryField = <K extends keyof PlanEntry>(index: number, key: K, value: PlanEntry[K]) => {
    setEditorPlan((prev) => {
      if (!prev) return prev;
      const updated = prev.plan.map((entry, idx) => (idx === index ? { ...entry, [key]: value } : entry));
      return { ...prev, plan: updated };
    });
  };

  const handleAddEntry = () => {
    setEditorPlan((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.plan.length + 1;
      const nextEntry: PlanEntry = {
        phase: `W${nextIndex}`,
        A: 0,
        X: 0,
        BZ: 0,
        pH: "",
        EC: "",
        durationDays: 7,
      };
      return { ...prev, plan: [...prev.plan, nextEntry] };
    });
  };

  const handleRemoveEntry = (index: number) => {
    setEditorPlan((prev) => {
      if (!prev) return prev;
      return { ...prev, plan: prev.plan.filter((_, idx) => idx !== index) };
    });
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
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white"
                      onClick={handleCreateDraft}
                      disabled={!selectedPlan}
                    >
                      Neuen Plan anlegen
                    </button>
                    <button
                      className="rounded-full border border-brand-purple/40 bg-brand-purple/15 px-4 py-2 text-xs text-brand-purple shadow-brand-glow hover:border-brand-purple/70"
                      onClick={handleGenerateAiPlan}
                      disabled={!selectedPlan || aiGenerating}
                    >
                      {aiGenerating ? "AI generiert…" : "AI-Plan generieren"}
                    </button>
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white"
                      onClick={() => setOptimizerOpen(true)}
                      disabled={!selectedPlan}
                    >
                      Plan optimieren
                    </button>
                  </div>
                </div>
              )}
              {selectedPlan && (
                <div className="rounded-2xl border border-brand-purple/30 bg-brand-purple/10 px-4 py-3 text-sm text-white/70">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">AI-Powered Plans</p>
                  <p className="mt-2 text-white/80">
                    AI optimiert den Wochenplan basierend auf Wasserprofil, Phase und Grow-Trends.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-brand-purple/40 bg-brand-purple/15 px-4 py-2 text-xs text-brand-purple shadow-brand-glow hover:border-brand-purple/70"
                      onClick={handleGenerateAiPlan}
                      disabled={!selectedPlan || aiGenerating}
                    >
                      {aiGenerating ? "AI generiert…" : "AI-Plan starten"}
                    </button>
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white"
                      onClick={handleCreateDraft}
                      disabled={!selectedPlan}
                    >
                      Plan-Editor öffnen
                    </button>
                  </div>
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
          <button
            className="w-full rounded-full border border-grow-lime/40 bg-grow-lime/10 px-5 py-3 text-sm text-grow-lime shadow-neon transition hover:border-grow-lime/60 hover:bg-grow-lime/20"
            onClick={handleConfirmMix}
            disabled={!result || confirming}
          >
            {confirming ? "Bestaetige…" : "Mix bestaetigen"}
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

                {result.ppm && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-white/50">PPM Profil</p>
                      <span className="text-xs text-white/60">NPK {buildNpkRatio(result.ppm)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ppmKeys.map((key) => (
                        <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <span className="text-xs text-white/60">{key}</span>
                          <span className="text-sm text-white/90">{(result.ppm?.[key] ?? 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/60">
                Wähle Cultivar, Plan und Parameter – dann auf „Dosis berechnen“ klicken.
              </p>
            )}
          </motion.div>

          <motion.div variants={fadeUp}>
            <MixingInstructionsPanel
              mix={result?.mix}
              ppm={result?.ppm}
              reservoirLiters={inputs.reservoir}
              topDress={result?.top_dress}
            />
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
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={inventoryInput[key] ?? ""}
                          onChange={(event: ValueEvent) =>
                            setInventoryInput((prev) => ({ ...prev, [key]: event.target.value }))
                          }
                          className="w-24 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                          placeholder="Verbrauch"
                        />
                        <button
                          className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/70 hover:border-brand-cyan/40"
                          onClick={() => handleInventoryConsume(key)}
                        >
                          Buchen
                        </button>
                      </div>
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

      {showEditor && editorPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="glass-panel flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl p-6 text-white shadow-neon">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Plan Editor</p>
                <h3 className="mt-2 text-2xl font-light">Plan anlegen</h3>
                <p className="text-sm text-white/60">Passe Plan-Details an und speichere als neuen Plan.</p>
              </div>
              <button
                className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70 hover:border-white/40"
                onClick={() => setShowEditor(false)}
              >
                Schließen
              </button>
            </div>

            {aiSummary && (
              <div className="mt-4 rounded-2xl border border-brand-purple/40 bg-brand-purple/10 px-4 py-3 text-xs text-brand-purple">
                {aiSummary}
              </div>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-white/70">
                Planname
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  value={editorPlan.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraftField("name", event.target.value)}
                />
              </label>
              <label className="text-sm text-white/70">
                Osmose-Anteil (0-1)
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={editorPlan.osmosisShare}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateDraftField("osmosisShare", Number(event.target.value) || 0)
                  }
                />
              </label>
              <label className="text-sm text-white/70 md:col-span-2">
                Beschreibung
                <textarea
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  rows={2}
                  value={editorPlan.description}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateDraftField("description", event.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Plan-Phasen</p>
              <button
                className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
                onClick={handleAddEntry}
              >
                Phase hinzufügen
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="bg-black/40 text-white/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Phase</th>
                    <th className="px-3 py-2 text-right">A</th>
                    <th className="px-3 py-2 text-right">X</th>
                    <th className="px-3 py-2 text-right">BZ</th>
                    <th className="px-3 py-2 text-right">pH</th>
                    <th className="px-3 py-2 text-right">EC</th>
                    <th className="px-3 py-2 text-right">Tage</th>
                    <th className="px-3 py-2 text-right">Tide</th>
                    <th className="px-3 py-2 text-right">Helix</th>
                    <th className="px-3 py-2 text-right">Ligand</th>
                    <th className="px-3 py-2 text-right">Silicate</th>
                    <th className="px-3 py-2 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {editorPlan.plan.map((entry, index) => (
                    <tr key={`${entry.phase}-${index}`} className="border-t border-white/5">
                      <td className="px-3 py-2">
                        <input
                          className="w-28 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-white"
                          value={entry.phase}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "phase", event.target.value)
                          }
                        />
                      </td>
                      {([
                        ["A", entry.A],
                        ["X", entry.X],
                        ["BZ", entry.BZ],
                      ] as const).map(([key, value]) => (
                        <td key={key} className="px-3 py-2 text-right">
                          <input
                            className="w-16 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-right text-white"
                            type="number"
                            step={0.01}
                            value={value}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateEntryField(index, key, Number(event.target.value) || 0)
                            }
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <input
                          className="w-20 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-right text-white"
                          value={entry.pH}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "pH", event.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          className="w-20 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-right text-white"
                          value={entry.EC}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "EC", event.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          className="w-16 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-right text-white"
                          type="number"
                          min={1}
                          step={1}
                          value={entry.durationDays ?? 7}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "durationDays", Number(event.target.value) || 1)
                          }
                        />
                      </td>
                      {([
                        ["Tide", entry.Tide ?? ""],
                        ["Helix", entry.Helix ?? ""],
                        ["Ligand", entry.Ligand ?? ""],
                        ["Silicate", entry.Silicate ?? ""],
                      ] as const).map(([key, value]) => (
                        <td key={key} className="px-3 py-2 text-right">
                          <input
                            className="w-16 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-right text-white"
                            type="number"
                            step={0.01}
                            value={value}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateEntryField(index, key as keyof PlanEntry, Number(event.target.value) || 0)
                            }
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded-full border border-brand-red/40 bg-brand-red/10 px-3 py-1 text-xs text-brand-red"
                          onClick={() => handleRemoveEntry(index)}
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={activateAfterSave}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setActivateAfterSave(event.target.checked)}
                />
                Nach dem Speichern aktivieren
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70"
                  onClick={() => setShowEditor(false)}
                >
                  Abbrechen
                </button>
                <button
                  className="rounded-full border border-brand-cyan/40 bg-brand-cyan/15 px-5 py-2 text-xs text-brand-cyan shadow-brand-glow"
                  onClick={handlePlanSave}
                  disabled={planSaving}
                >
                  {planSaving ? "Speichert…" : "Plan speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {optimizerOpen && selectedPlan && (
        <PlanOptimizerModal
          isOpen={optimizerOpen}
          onClose={() => setOptimizerOpen(false)}
          plan={selectedPlan}
          lang="de"
          cultivar={cultivar}
          substrate={substrate}
          onApply={(response) => {
            const aiPlanEntries = mergeAiSuggestions(selectedPlan.plan, response.plan);
            const draft = buildDraftFromPlan(selectedPlan, {
              name: `AI Plan ${selectedPlan.name}`,
              description: response.summary ?? "AI-generierter Plan basierend auf Targets.",
              plan: aiPlanEntries,
            });
            setEditorPlan(draft);
            setAiSummary(response.summary ?? null);
            setShowEditor(true);
            setOptimizerOpen(false);
          }}
        />
      )}
    </motion.section>
  );
}
