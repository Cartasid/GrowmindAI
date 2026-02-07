import { motion } from "framer-motion";
import { CalendarDays, Flame, Flower2, Leaf, Sparkles, Sprout, SunMedium } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { Cultivar, ManagedPlan, NutrientProfile, ObservationAdjustments, PlanEntry, Substrate } from "../types";
import { useToast } from "./ToastProvider";
import {
  fetchInventory,
  fetchNutrientPlan,
  confirmNutrientMix,
  consumeInventory,
  setInventoryLevel,
  type InventoryResponse,
  type MixResponse,
} from "../services/nutrientService";
import { createPlan, deletePlan, fetchActivePlan, fetchAvailablePlans, fetchDefaultPlan, setActivePlan, updatePlan } from "../services/planService";
import { MixingInstructionsPanel } from "./MixingInstructionsPanel";

const DEFAULT_CULTIVAR: Cultivar = "wedding_cake";
const DEFAULT_SUBSTRATE: Substrate = "coco";

type PlanInputs = {
  phase: string;
  reservoir: number;
};

const DEFAULT_INPUTS: PlanInputs = {
  phase: "Early Veg",
  reservoir: 100,
};

const MIX_ORDER = ["part_a", "part_b", "part_c", "burst", "kelp", "amino", "fulvic", "quench"] as const;
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

const DEFAULT_OBSERVATIONS = {
  ecTrend: "neutral",
  phDrift: "normal",
  tipburn: "none",
  pale: "none",
  caMgDeficiency: "none",
  claw: "none",
} as const;

const MIX_META: Record<string, { label: string; unit: string }> = {
  part_a: { label: "Core (Part A)", unit: "g" },
  part_b: { label: "Vector (Part B)", unit: "g" },
  part_c: { label: "Pulse (Part C)", unit: "g" },
  burst: { label: "Burst (PK)", unit: "g" },
  kelp: { label: "Coast (Kelp)", unit: "g" },
  amino: { label: "Vitality (Amino)", unit: "ml" },
  fulvic: { label: "Humic (Fulvic)", unit: "ml" },
  shield: { label: "Silicate / Hypo", unit: "g" },
  quench: { label: "Quench", unit: "g" },
};

const MIX_DESCRIPTIONS: Record<string, string> = {
  part_a: "CORE Basis (N+Ca).",
  part_b: "VECTOR Basis (Veg/early flower).",
  part_c: "PULSE Basis (Bloom, N-frei).",
  burst: "BURST PK-Booster (spaete Bluete).",
  kelp: "Tide/Coast Kelp (Stressschutz).",
  amino: "Helix/Vitality Aminos (Bio-Booster).",
  fulvic: "Ligand/Humic Fulvic (Aufnahme).",
  shield: "Silicate-Topdress (per Pflanze anwenden).",
  quench: "Quench nur in der letzten Bluetewoche (0.3 g/L).",
};

const WATER_PROFILE_FIELDS: Array<{ key: keyof NutrientProfile; label: string }> = [
  { key: "N", label: "N" },
  { key: "Ca", label: "Ca" },
  { key: "Mg", label: "Mg" },
  { key: "K", label: "K" },
  { key: "Na", label: "Na" },
  { key: "S", label: "S" },
  { key: "Cl", label: "Cl" },
  { key: "Fe", label: "Fe" },
  { key: "Mn", label: "Mn" },
];

const DEFAULT_OBSERVATION_ADJUSTMENTS: ObservationAdjustments = {
  ecTrend: { low: 3, high: 0 },
  phDrift: { up: 0, down: 5 },
  tipburn: { mild: -5, strong: -7.5 },
  pale: { mild: 8, strong: 12 },
  caMgDeficiency: { mild: 5, strong: 8 },
  claw: { mild: -6, strong: -8 },
};

const OBSERVATION_EDIT_FIELDS = [
  { key: "ecTrend", label: "EC-Trend", options: [
    { key: "low", label: "Niedrig" },
    { key: "high", label: "Hoch" },
  ] },
  { key: "phDrift", label: "pH-Drift", options: [
    { key: "down", label: "Drift runter" },
    { key: "up", label: "Drift hoch" },
  ] },
  { key: "tipburn", label: "Spitzenbrand", options: [
    { key: "mild", label: "Leicht" },
    { key: "strong", label: "Stark" },
  ] },
  { key: "pale", label: "Stark aufgehellt", options: [
    { key: "mild", label: "Leicht" },
    { key: "strong", label: "Stark" },
  ] },
  { key: "caMgDeficiency", label: "Ca/Mg-Mangel", options: [
    { key: "mild", label: "Leicht" },
    { key: "strong", label: "Stark" },
  ] },
  { key: "claw", label: "Adlerkralle", options: [
    { key: "mild", label: "Leicht" },
    { key: "strong", label: "Stark" },
  ] },
] as const;

const formatDate = (value: Date) =>
  value.toLocaleDateString("de-DE", { day: "numeric", month: "short" });

const phaseTone = (phase: string) => {
  const lower = phase.toLowerCase();
  if (phase === "Ernte") return "from-grow-lime/20 via-transparent to-grow-lime/10";
  if (lower.includes("veg")) return "from-emerald-400/20 via-transparent to-emerald-400/10";
  if (lower.startsWith("w")) return "from-brand-cyan/20 via-transparent to-brand-cyan/10";
  if (lower.includes("transition") || lower.includes("flower") || lower.includes("p")) {
    return "from-violet-400/20 via-transparent to-violet-400/10";
  }
  return "from-white/10 via-transparent to-white/5";
};

const phaseBadge = (phase: string) => {
  const lower = phase.toLowerCase();
  if (phase === "Ernte") return "border-grow-lime/40 bg-grow-lime/10 text-grow-lime";
  if (lower.includes("veg")) return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (lower.startsWith("w")) return "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan";
  if (lower.includes("transition") || lower.includes("flower") || lower.includes("p")) {
    return "border-violet-400/40 bg-violet-400/10 text-violet-200";
  }
  return "border-white/20 bg-white/5 text-white/60";
};

const phaseIcon = (phase: string) => {
  const lower = phase.toLowerCase();
  if (phase === "Ernte") return Sparkles;
  if (lower.includes("early")) return Sprout;
  if (lower.includes("mid")) return Leaf;
  if (lower.includes("late")) return SunMedium;
  if (lower.startsWith("w")) {
    const week = Number.parseInt(lower.replace("w", ""), 10);
    if (Number.isFinite(week)) {
      if (week <= 4) return Flower2;
      if (week <= 8) return Flame;
      return Sparkles;
    }
  }
  if (lower.includes("transition") || lower.includes("flower") || lower.includes("p")) return Flower2;
  return CalendarDays;
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

const AUTO_PHASE_STORAGE_KEY = "growmind_nutrient_auto_phase";

export function NutrientCalculator() {
  const cultivar = DEFAULT_CULTIVAR;
  const substrate = DEFAULT_SUBSTRATE;
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
  const [startDateDraft, setStartDateDraft] = useState("");
  const [startDateSaving, setStartDateSaving] = useState(false);
  const [activateAfterSave, setActivateAfterSave] = useState(true);
  const [autoPhase, setAutoPhase] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(AUTO_PHASE_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  });
  const [observations, setObservations] = useState({ ...DEFAULT_OBSERVATIONS });
  const [inventoryInput, setInventoryInput] = useState<Record<string, string>>({});
  const [inventorySetInput, setInventorySetInput] = useState<Record<string, string>>({});
  const [importingPlans, setImportingPlans] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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

  const mixDescriptions = useMemo(() => {
    const base = { ...MIX_DESCRIPTIONS };
    if (!inventory?.inventory) return base;
    return Object.entries(inventory.inventory).reduce((acc, [key, value]) => {
      if (value.description) acc[key] = value.description;
      return acc;
    }, base);
  }, [inventory]);

  const selectedPlan = useMemo(() => {
    if (!plans.length) return null;
    return plans.find((plan: ManagedPlan) => plan.id === selectedPlanId) ?? plans[0];
  }, [plans, selectedPlanId]);

  const selectedWaterProfile = selectedPlan?.waterProfile ?? {};
  const osmosisPercent = Math.round((selectedPlan?.osmosisShare ?? 0) * 100);

  useEffect(() => {
    setStartDateDraft(selectedPlan?.startDate ?? "");
  }, [selectedPlan]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTO_PHASE_STORAGE_KEY, String(autoPhase));
  }, [autoPhase]);

  const observationAdjustments = useMemo(
    () => selectedPlan?.observationAdjustments ?? DEFAULT_OBSERVATION_ADJUSTMENTS,
    [selectedPlan]
  );

  const schedule = useMemo(() => {
    if (!selectedPlan?.plan || !selectedPlan.startDate) return [] as Array<{
      phase: string;
      start: Date;
      end: Date;
      label: string;
    }>;
    const startDate = new Date(`${selectedPlan.startDate}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return [];
    let cursor = new Date(startDate);
    const rows = selectedPlan.plan.map((entry) => {
      const duration = entry.durationDays ?? 7;
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + Math.max(1, duration) - 1);
      cursor.setDate(cursor.getDate() + Math.max(1, duration));
      return {
        phase: entry.phase,
        start,
        end,
        label: `${formatDate(start)} – ${formatDate(end)}`,
      };
    });
    if (rows.length) {
      const lastEnd = rows[rows.length - 1].end;
      const harvest = new Date(lastEnd);
      harvest.setDate(harvest.getDate() + 1);
      rows.push({
        phase: "Ernte",
        start: harvest,
        end: harvest,
        label: formatDate(harvest),
      });
    }
    return rows;
  }, [selectedPlan]);

  const currentPhase = useMemo(() => {
    if (!schedule.length) return null;
    const today = new Date();
    return schedule.find((item) => today >= item.start && today <= item.end)?.phase ?? null;
  }, [schedule]);

  const cloneEntries = (planEntries: PlanEntry[]) =>
    planEntries.map((entry) => ({
      ...entry,
      notes: entry.notes ? [...entry.notes] : undefined,
    }));

  const normalizeAdjustments = (plan: ManagedPlan): ObservationAdjustments => {
    return {
      ...DEFAULT_OBSERVATION_ADJUSTMENTS,
      ...(plan.observationAdjustments ?? {}),
    };
  };

  const buildDraftFromPlan = (plan: ManagedPlan, overrides?: Partial<EditablePlan>): EditablePlan => ({
    id: undefined,
    name: plan.name,
    description: plan.description ?? "",
    cultivarInfo: plan.cultivarInfo ?? "",
    substrateInfo: plan.substrateInfo ?? "",
    plan: cloneEntries(plan.plan),
    waterProfile: { ...plan.waterProfile },
    osmosisShare: plan.osmosisShare,
    startDate: plan.startDate ?? "",
    observationAdjustments: normalizeAdjustments(plan),
    isDefault: false,
    ...overrides,
  });

  const buildEditableFromPlan = (plan: ManagedPlan): EditablePlan => ({
    id: plan.id,
    name: plan.name,
    description: plan.description ?? "",
    cultivarInfo: plan.cultivarInfo ?? "",
    substrateInfo: plan.substrateInfo ?? "",
    plan: cloneEntries(plan.plan),
    waterProfile: { ...plan.waterProfile },
    osmosisShare: plan.osmosisShare,
    startDate: plan.startDate ?? "",
    observationAdjustments: normalizeAdjustments(plan),
    isDefault: Boolean(plan.isDefault),
  });

  const phaseOptions = useMemo(() => {
    if (!selectedPlan?.plan) return [DEFAULT_INPUTS.phase];
    const phases = selectedPlan.plan
      .map((entry: ManagedPlan["plan"][number]) => entry.phase)
      .filter(Boolean);
    return phases.length ? phases : [DEFAULT_INPUTS.phase];
  }, [selectedPlan]);

  const currentEntry = useMemo(() => {
    if (!selectedPlan?.plan) return null;
    return selectedPlan.plan.find((entry) => entry.phase === inputs.phase) ?? null;
  }, [selectedPlan, inputs.phase]);

  useEffect(() => {
    if (!phaseOptions.includes(inputs.phase)) {
      setInputs((prev: PlanInputs) => ({ ...prev, phase: phaseOptions[0] }));
    }
  }, [phaseOptions, inputs.phase]);

  useEffect(() => {
    if (!autoPhase || !currentPhase) return;
    if (currentPhase === inputs.phase) return;
    setInputs((prev: PlanInputs) => ({ ...prev, phase: currentPhase }));
  }, [autoPhase, currentPhase, inputs.phase]);

  const handleInputChange = <K extends keyof PlanInputs>(key: K, value: PlanInputs[K]) => {
    if (key === "phase") {
      setAutoPhase(false);
    }
    setInputs((prev: PlanInputs) => ({ ...prev, [key]: value }));
  };

  const handleInventorySet = async (key: string) => {
    const raw = inventorySetInput[key] ?? "";
    if (!raw.trim()) return;
    const value = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      addToast({ title: "Ungueltiger Wert", description: "Bitte eine Zahl >= 0 eingeben.", variant: "error" });
      return;
    }
    try {
      const response = await setInventoryLevel({ component: key, grams: value });
      setInventory(response);
      setInventorySetInput((prev) => ({ ...prev, [key]: "" }));
      addToast({ title: "Bestand aktualisiert", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Update fehlgeschlagen", description: message, variant: "error" });
    }
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
        plan_id: selectedPlanId || undefined,
        observations: observations as Record<string, string>,
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
        plan_id: selectedPlanId || undefined,
        observations: observations as Record<string, string>,
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
    setShowEditor(true);
  };

  const handleEditPlan = () => {
    if (!selectedPlan) return;
    setEditorPlan(buildEditableFromPlan(selectedPlan));
    setShowEditor(true);
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
      const isEditing = Boolean(editorPlan.id);
      const wasActive = editorPlan.id === activePlanId;
      const saved = isEditing
        ? await updatePlan(cultivar, substrate, editorPlan as ManagedPlan)
        : await createPlan(cultivar, substrate, editorPlan);
      const available = await fetchAvailablePlans(cultivar, substrate);
      setPlans(available);
      setSelectedPlanId(saved.id);
      if (wasActive) {
        const activeId = await setActivePlan(cultivar, substrate, saved.id);
        setActivePlanId(activeId);
      } else if (activateAfterSave) {
        const activeId = await setActivePlan(cultivar, substrate, saved.id);
        setActivePlanId(activeId);
      }
      setShowEditor(false);
      addToast({ title: isEditing ? "Plan aktualisiert" : "Plan gespeichert", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Plan speichern fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setPlanSaving(false);
    }
  };

  const handlePlanDelete = async () => {
    if (!selectedPlan) return;
    if (selectedPlan.id === "default") return;
    const confirmed = window.confirm(`Plan "${selectedPlan.name}" wirklich loeschen?`);
    if (!confirmed) return;
    setPlanSaving(true);
    try {
      await deletePlan(cultivar, substrate, selectedPlan.id);
      const available = await fetchAvailablePlans(cultivar, substrate);
      setPlans(available);
      const nextId = available.find((plan) => plan.id === activePlanId)?.id || available[0]?.id || "default";
      setSelectedPlanId(nextId);
      addToast({ title: "Plan geloescht", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Plan loeschen fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setPlanSaving(false);
    }
  };

  const handleStartDateSave = async () => {
    if (!selectedPlan) return;
    setStartDateSaving(true);
    try {
      const nextStartDate = startDateDraft || undefined;
      const saved = await updatePlan(cultivar, substrate, {
        ...selectedPlan,
        startDate: nextStartDate,
      });
      setPlans((prev) => prev.map((plan) => (plan.id === saved.id ? saved : plan)));
      setSelectedPlanId(saved.id);
      addToast({ title: "Startdatum gespeichert", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Startdatum speichern fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setStartDateSaving(false);
    }
  };

  const handleExportPlans = (onlySelected: boolean) => {
    const exportPlans = onlySelected && selectedPlan ? [selectedPlan] : plans;
    if (!exportPlans.length) {
      addToast({ title: "Kein Plan zum Export", variant: "error" });
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      cultivar,
      substrate,
      plans: exportPlans,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix = onlySelected ? "plan" : "plaene";
    link.href = url;
    link.download = `growmind-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPlans = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportingPlans(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawPlans = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.plans)
          ? parsed.plans
          : parsed?.plan
            ? [parsed.plan]
            : parsed?.id && parsed?.plan
              ? [parsed]
              : [];

      if (!rawPlans.length) {
        addToast({ title: "Import fehlgeschlagen", description: "Keine Plaene im JSON gefunden.", variant: "error" });
        return;
      }

      const created: ManagedPlan[] = [];
      for (const plan of rawPlans) {
        if (!plan || !plan.plan) continue;
        const draft = {
          ...plan,
          id: undefined,
          isDefault: false,
          name: plan.id === "default" ? `${plan.name} (Import)` : plan.name,
        } as EditablePlan;
        const saved = await createPlan(cultivar, substrate, draft);
        created.push(saved);
      }

      const available = await fetchAvailablePlans(cultivar, substrate);
      setPlans(available);
      if (created.length) {
        setSelectedPlanId(created[created.length - 1].id);
      }
      addToast({ title: "Plaene importiert", description: `${created.length} Plaene hinzugefuegt.`, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Import fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setImportingPlans(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const updateDraftField = <K extends keyof EditablePlan>(key: K, value: EditablePlan[K]) => {
    setEditorPlan((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateWaterProfileField = (key: keyof NutrientProfile, value: number) => {
    setEditorPlan((prev) => {
      if (!prev) return prev;
      const current = { ...(prev.waterProfile ?? {}) } as NutrientProfile;
      current[key] = value;
      return { ...prev, waterProfile: current };
    });
  };

  const updateEntryField = <K extends keyof PlanEntry>(index: number, key: K, value: PlanEntry[K]) => {
    setEditorPlan((prev) => {
      if (!prev) return prev;
      const updated = prev.plan.map((entry, idx) => (idx === index ? { ...entry, [key]: value } : entry));
      return { ...prev, plan: updated };
    });
  };

  const updateAdjustmentField = (key: keyof ObservationAdjustments, option: string, value: number) => {
    setEditorPlan((prev) => {
      if (!prev) return prev;
      const nextAdjustments = {
        ...DEFAULT_OBSERVATION_ADJUSTMENTS,
        ...(prev.observationAdjustments ?? {}),
      } as ObservationAdjustments;
      const current = { ...(nextAdjustments[key] ?? {}) } as Record<string, number>;
      current[option] = value;
      nextAdjustments[key] = current as any;
      return { ...prev, observationAdjustments: nextAdjustments };
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
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">Standard Setup</p>
                <p className="mt-2 text-white/80">Wedding Cake · Coco</p>
              </div>
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
              <label className="text-sm text-white/70">
                Startdatum (fuer Wochenplan)
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                  type="date"
                  value={startDateDraft}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setStartDateDraft(event.target.value)}
                  disabled={!selectedPlan}
                />
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
                  <p className="mt-2 text-xs text-white/50">
                    Cultivar: {selectedPlan.cultivarInfo || "Wedding Cake"} · Substrat: {selectedPlan.substrateInfo || "Coco"}
                  </p>
                  <p className="mt-2 text-xs text-white/60">Osmoseanteil: {osmosisPercent}%</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/60 sm:grid-cols-4">
                    {WATER_PROFILE_FIELDS.map((field) => (
                      <div key={field.key} className="rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-center">
                        <p className="text-white/70">{field.label}</p>
                        <p className="text-white">{(selectedWaterProfile[field.key] ?? 0).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white disabled:opacity-60"
                      onClick={handleStartDateSave}
                      disabled={startDateSaving || !selectedPlan}
                    >
                      {startDateSaving ? "Speichert..." : "Startdatum speichern"}
                    </button>
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/70 hover:border-brand-red/50 hover:text-white disabled:opacity-60"
                      onClick={handlePlanDelete}
                      disabled={planSaving || selectedPlan.id === "default"}
                    >
                      Plan loeschen
                    </button>
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white"
                      onClick={() => handleExportPlans(true)}
                      disabled={!selectedPlan}
                    >
                      Plan exportieren
                    </button>
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white"
                      onClick={() => handleExportPlans(false)}
                      disabled={!plans.length}
                    >
                      Alle Plaene exportieren
                    </button>
                    <button
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-1 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white disabled:opacity-60"
                      onClick={() => importInputRef.current?.click()}
                      disabled={importingPlans}
                    >
                      {importingPlans ? "Importiert..." : "Plaene importieren"}
                    </button>
                    <input
                      ref={importInputRef}
                      className="hidden"
                      type="file"
                      accept="application/json"
                      onChange={handleImportPlans}
                    />
                  </div>
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
                      className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70 hover:border-brand-cyan/40 hover:text-white"
                      onClick={handleEditPlan}
                      disabled={!selectedPlan}
                    >
                      Plan bearbeiten
                    </button>
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">Beobachtungen</p>
                <div className="mt-3 space-y-3 text-xs text-white/60">
                  <label className="block">
                    EC-Trend
                    <select
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      value={observations.ecTrend}
                      onChange={(event: ValueEvent) =>
                        setObservations((prev) => ({ ...prev, ecTrend: event.target.value as any }))
                      }
                    >
                      <option value="low" className="bg-[#070a16]">Fallen</option>
                      <option value="neutral" className="bg-[#070a16]">Neutral</option>
                      <option value="high" className="bg-[#070a16]">Steigend</option>
                    </select>
                    <p className="mt-1 text-[11px] text-white/50">
                      Wie hat sich der EC-Wert in den letzten 24h veraendert?
                    </p>
                  </label>
                  <label className="block">
                    pH-Drift
                    <select
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      value={observations.phDrift}
                      onChange={(event: ValueEvent) =>
                        setObservations((prev) => ({ ...prev, phDrift: event.target.value as any }))
                      }
                    >
                      <option value="down" className="bg-[#070a16]">Nach unten</option>
                      <option value="normal" className="bg-[#070a16]">Normal</option>
                      <option value="up" className="bg-[#070a16]">Nach oben</option>
                    </select>
                    <p className="mt-1 text-[11px] text-white/50">
                      Drift nach oben/unten kann auf Probleme hinweisen.
                    </p>
                  </label>
                  <label className="block">
                    Spitzenbrand
                    <select
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      value={observations.tipburn}
                      onChange={(event: ValueEvent) =>
                        setObservations((prev) => ({ ...prev, tipburn: event.target.value as any }))
                      }
                    >
                      <option value="none" className="bg-[#070a16]">Nein</option>
                      <option value="mild" className="bg-[#070a16]">Leicht</option>
                      <option value="strong" className="bg-[#070a16]">Stark</option>
                    </select>
                  </label>
                  <label className="block">
                    Stark aufgehellt
                    <select
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      value={observations.pale}
                      onChange={(event: ValueEvent) =>
                        setObservations((prev) => ({ ...prev, pale: event.target.value as any }))
                      }
                    >
                      <option value="none" className="bg-[#070a16]">Nein</option>
                      <option value="mild" className="bg-[#070a16]">Leicht</option>
                      <option value="strong" className="bg-[#070a16]">Stark</option>
                    </select>
                  </label>
                  <label className="block">
                    Ca/Mg-Mangel
                    <select
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      value={observations.caMgDeficiency}
                      onChange={(event: ValueEvent) =>
                        setObservations((prev) => ({ ...prev, caMgDeficiency: event.target.value as any }))
                      }
                    >
                      <option value="none" className="bg-[#070a16]">Nein</option>
                      <option value="mild" className="bg-[#070a16]">Leicht</option>
                      <option value="strong" className="bg-[#070a16]">Stark</option>
                    </select>
                  </label>
                  <label className="block">
                    Adlerkralle
                    <select
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      value={observations.claw}
                      onChange={(event: ValueEvent) =>
                        setObservations((prev) => ({ ...prev, claw: event.target.value as any }))
                      }
                    >
                      <option value="none" className="bg-[#070a16]">Nein</option>
                      <option value="mild" className="bg-[#070a16]">Leicht</option>
                      <option value="strong" className="bg-[#070a16]">Stark</option>
                    </select>
                  </label>
                </div>
              </div>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Wochenplan</p>
                <p className="mt-2 text-sm text-white/60">
                  {selectedPlan?.startDate
                    ? `Startdatum: ${selectedPlan.startDate}`
                    : "Kein Startdatum hinterlegt."}
                </p>
              </div>
              <button
                className={`rounded-full border px-3 py-1 text-[10px] ${
                  autoPhase
                    ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                    : "border-white/10 bg-black/40 text-white/70"
                }`}
                onClick={() => setAutoPhase((prev) => !prev)}
              >
                {autoPhase ? "Auto aktiv" : "Auto aus"}
              </button>
            </div>
            {schedule.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {schedule.map((item) => {
                  const isCurrent = currentPhase === item.phase;
                  const Icon = phaseIcon(item.phase);
                  return (
                    <div
                      key={item.phase}
                      className={`relative overflow-hidden rounded-2xl border px-4 py-4 text-xs ${
                        isCurrent
                          ? "border-brand-cyan/60 bg-brand-cyan/10 text-white"
                          : "border-white/10 bg-black/30 text-white/70"
                      } ${phaseGlow(item.phase)}`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${phaseTone(item.phase)} opacity-70`} />
                      <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${phaseBadge(item.phase)}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] ${phaseBadge(item.phase)}`}>
                              {item.phase}
                            </span>
                            <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-white/50">Zeitraum</p>
                          </div>
                        </div>
                        {isCurrent && (
                          <span className="rounded-full border border-grow-lime/40 bg-grow-lime/10 px-2 py-0.5 text-[10px] text-grow-lime">
                            Aktuell
                          </span>
                        )}
                      </div>
                      <div className="relative z-10 mt-2">
                        <p className="text-lg font-semibold tracking-tight text-white">{item.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-xs text-white/50">Startdatum im Plan setzen, um den Wochenplan zu sehen.</p>
            )}
          </motion.div>
          <motion.div variants={fadeUp} className="glass-panel rounded-3xl p-5 shadow-neon sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Ergebnis</p>
            {result ? (
              <div className="mt-4 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{inputs.phase}</h3>
                    <p className="text-sm text-white/60">Tank {inputs.reservoir} L · Substrat {substrate}</p>
                    <p className="mt-1 text-xs text-white/60">
                      Ziel-EC: {currentEntry?.EC ? currentEntry.EC : "-"}
                    </p>
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
                        <th className="px-4 py-2 text-right">pro L</th>
                        <th className="px-4 py-2 text-right">Gesamt</th>
                        <th className="px-4 py-2 text-right">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MIX_ORDER.filter((key) => key in result.mix).map((key) => {
                        const item = inventory?.inventory?.[key];
                        const fallback = MIX_META[key] ?? { label: key, unit: "g" };
                        const unit = item?.unit || fallback.unit;
                        const label = item?.name || fallback.label;
                        const description = item?.description || mixDescriptions[key];
                        const total = result.mix[key];
                        const perLiter = inputs.reservoir ? total / inputs.reservoir : 0;
                        return (
                          <tr key={key} className="border-t border-white/5">
                            <td className="px-4 py-2 text-white" title={description}>{label}</td>
                            <td className="px-4 py-2 text-right text-white/80">
                              {perLiter.toFixed(2)} {unit}/L
                            </td>
                            <td className="px-4 py-2 text-right text-white/80">
                              {total.toFixed(2)} {unit}
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-white/50">{description || "-"}</td>
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
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <span>NPK-Verhaeltnis</span>
                        <span>{buildNpkRatio(result.ppm)}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4">
                        {(["N", "P", "K"] as const).map((key) => {
                          const value = result.ppm?.[key] ?? 0;
                          const maxValue = Math.max(result.ppm?.N ?? 0, result.ppm?.P ?? 0, result.ppm?.K ?? 0, 1);
                          const height = Math.max(8, (value / maxValue) * 120);
                          const color = key === "N" ? "bg-emerald-400" : key === "P" ? "bg-orange-400" : "bg-purple-400";
                          return (
                            <div key={key} className="flex flex-col items-center gap-2">
                              <div className="flex h-32 w-full items-end justify-center">
                                <div className={`w-12 rounded-xl ${color}`} style={{ height }} />
                              </div>
                              <div className="text-sm text-white/90">{value.toFixed(0)}</div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">{key}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/60">
                Waehle Plan und Parameter - dann auf "Dosis berechnen" klicken.
              </p>
            )}
          </motion.div>

          <motion.div variants={fadeUp}>
            <MixingInstructionsPanel
              mix={result?.mix}
              ppm={result?.ppm}
              reservoirLiters={inputs.reservoir}
              topDress={result?.top_dress}
              descriptions={mixDescriptions}
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
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={inventorySetInput[key] ?? ""}
                          onChange={(event: ValueEvent) =>
                            setInventorySetInput((prev) => ({ ...prev, [key]: event.target.value }))
                          }
                          className="w-24 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                          placeholder="Bestand"
                        />
                        <button
                          className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/70 hover:border-brand-cyan/40"
                          onClick={() => handleInventorySet(key)}
                        >
                          Setzen
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
                <h3 className="mt-2 text-2xl font-light">
                  {editorPlan?.id ? "Plan bearbeiten" : "Plan anlegen"}
                </h3>
                <p className="text-sm text-white/60">
                  {editorPlan?.id
                    ? "Passe Plan-Details an und aktualisiere den Plan."
                    : "Passe Plan-Details an und speichere als neuen Plan."}
                </p>
              </div>
              <button
                className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70 hover:border-white/40"
                onClick={() => setShowEditor(false)}
              >
                Schließen
              </button>
            </div>


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
                Cultivar (Info)
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  value={editorPlan.cultivarInfo || ""}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraftField("cultivarInfo", event.target.value)}
                />
              </label>
              <label className="text-sm text-white/70">
                Startdatum
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  type="date"
                  value={editorPlan.startDate || ""}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraftField("startDate", event.target.value)}
                />
              </label>
              <label className="text-sm text-white/70">
                Substrat (Info)
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  value={editorPlan.substrateInfo || ""}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraftField("substrateInfo", event.target.value)}
                />
              </label>
              <label className="text-sm text-white/70">
                Osmose-Anteil (%)
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white focus:border-brand-cyan/60 focus:outline-none"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((editorPlan.osmosisShare ?? 0) * 100)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateDraftField("osmosisShare", (Number(event.target.value) || 0) / 100)
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

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Beobachtungen (% Anpassung)</p>
              <p className="mt-2 text-xs text-white/60">Pro Auswahl wird A/X/BZ pro Liter angepasst.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {OBSERVATION_EDIT_FIELDS.map((field) => (
                  <div key={field.key} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                    <p className="text-xs text-white/70">{field.label}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {field.options.map((option) => (
                        <label key={option.key} className="text-[11px] text-white/60">
                          {option.label}
                          <input
                            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                            type="number"
                            step={0.1}
                            value={
                              (editorPlan.observationAdjustments as Record<string, Record<string, number>> | undefined)?.[
                                field.key
                              ]?.[option.key] ?? 0
                            }
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateAdjustmentField(
                                field.key as keyof ObservationAdjustments,
                                option.key,
                                Number(event.target.value) || 0
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Wasserprofil (ppm)</p>
              <p className="mt-2 text-xs text-white/60">Die Werte werden mit (1 - Osmoseanteil) skaliert.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {WATER_PROFILE_FIELDS.map((field) => (
                  <label key={field.key} className="text-[11px] text-white/60">
                    {field.label}
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                      type="number"
                      step={0.01}
                      value={(editorPlan.waterProfile?.[field.key] ?? 0) as number}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateWaterProfileField(field.key, Number(event.target.value) || 0)
                      }
                    />
                  </label>
                ))}
              </div>
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
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {editorPlan.plan.map((entry, index) => (
                  <div key={`${entry.phase}-${index}`} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs text-white/60">
                        Phase
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={entry.phase}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "phase", event.target.value)
                          }
                        />
                      </label>
                      <button
                        className="rounded-full border border-brand-red/40 bg-brand-red/10 px-3 py-1 text-xs text-brand-red"
                        onClick={() => handleRemoveEntry(index)}
                      >
                        Entfernen
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {([
                        ["A", entry.A],
                        ["X", entry.X],
                        ["BZ", entry.BZ],
                      ] as const).map(([key, value]) => (
                        <label key={key} className="text-[11px] text-white/60">
                          {key}
                          <input
                            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-right text-sm text-white"
                            type="number"
                            step={0.01}
                            value={value}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateEntryField(index, key, Number(event.target.value) || 0)
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <label className="text-[11px] text-white/60">
                        pH
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-right text-sm text-white"
                          value={entry.pH}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "pH", event.target.value)
                          }
                        />
                      </label>
                      <label className="text-[11px] text-white/60">
                        EC
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-right text-sm text-white"
                          value={entry.EC}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "EC", event.target.value)
                          }
                        />
                      </label>
                      <label className="text-[11px] text-white/60">
                        Tage
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-right text-sm text-white"
                          type="number"
                          min={1}
                          step={1}
                          value={entry.durationDays ?? 7}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateEntryField(index, "durationDays", Number(event.target.value) || 1)
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {([
                        ["Tide", entry.Tide ?? ""],
                        ["Helix", entry.Helix ?? ""],
                        ["Ligand", entry.Ligand ?? ""],
                        ["Silicate", entry.Silicate ?? ""],
                      ] as const).map(([key, value]) => (
                        <label key={key} className="text-[11px] text-white/60">
                          {key}
                          <input
                            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-right text-sm text-white"
                            type="number"
                            step={0.01}
                            value={value}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateEntryField(index, key as keyof PlanEntry, Number(event.target.value) || 0)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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

    </motion.section>
  );
}
