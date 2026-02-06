import { useEffect, useMemo, useState } from "react";
import type { Language, ManagedPlan, PlanOptimizationResponse, NutrientProfile, Substrate } from "../types";
import { optimizePlanWithTargets, type PlanOptimizerWeekInput } from "../services/aiService";
import { fetchWaterProfilePresets, type WaterProfilePreset } from "../services/planService";
import { useToast } from "./ToastProvider";

const NUTRIENTS = ["N", "P", "K", "Ca", "Mg", "S", "Na", "Fe", "B", "Mo", "Mn", "Zn", "Cu", "Cl"] as const;

const stages = ["veg", "flower", "ripen"] as const;

const WATER_KEYS = ["N", "Ca", "Mg", "K", "Na", "S", "Cl", "Fe", "Mn"] as const;

const buildWeeks = (plan: ManagedPlan): PlanOptimizerWeekInput[] =>
  plan.plan.map((entry) => ({
    phase: entry.phase,
    stage: entry.notes?.[0] ?? "flower",
    targets: {},
  }));

export function PlanOptimizerModal({
  isOpen,
  onClose,
  plan,
  lang,
  cultivar,
  substrate,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  plan: ManagedPlan;
  lang: Language;
  cultivar: string;
  substrate: Substrate;
  onApply: (plan: PlanOptimizationResponse) => void;
}) {
  const [weeks, setWeeks] = useState<PlanOptimizerWeekInput[]>(() => buildWeeks(plan));
  const [selectedNutrients, setSelectedNutrients] = useState<string[]>(["N", "P", "K", "Ca", "Mg", "S"]);
  const [submitting, setSubmitting] = useState(false);
  const [waterProfile, setWaterProfile] = useState<NutrientProfile>({ ...plan.waterProfile });
  const [osmosisShare, setOsmosisShare] = useState<string>(() => (plan.osmosisShare * 100).toFixed(1));
  const [presetId, setPresetId] = useState("default");
  const [presets, setPresets] = useState<WaterProfilePreset[]>([]);
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setWeeks(buildWeeks(plan));
      setSelectedNutrients(["N", "P", "K", "Ca", "Mg", "S"]);
      setWaterProfile({ ...plan.waterProfile });
      setOsmosisShare((plan.osmosisShare * 100).toFixed(1));
      setPresetId("default");
    }
  }, [isOpen, plan]);

  useEffect(() => {
    if (!isOpen) return;
    fetchWaterProfilePresets(substrate)
      .then((data) => {
        setPresets(data);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        addToast({ title: "Presets laden fehlgeschlagen", description: message, variant: "error" });
      });
  }, [isOpen, substrate, addToast]);

  const reset = () => {
    setWeeks(buildWeeks(plan));
    setSelectedNutrients(["N", "P", "K", "Ca", "Mg", "S"]);
    setWaterProfile({ ...plan.waterProfile });
    setOsmosisShare((plan.osmosisShare * 100).toFixed(1));
    setPresetId("default");
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  const updateWeek = (index: number, key: string, value: string) => {
    const normalized = value.trim();
    const numeric = normalized ? Number(normalized.replace(",", ".")) : null;
    const shouldSet = numeric != null && Number.isFinite(numeric);
    setWeeks((prev) =>
      prev.map((week, idx) =>
        idx === index
          ? {
              ...week,
              targets: {
                ...week.targets,
                ...(shouldSet
                  ? { [key]: numeric as number }
                  : Object.fromEntries(
                      Object.entries(week.targets).filter(([targetKey]) => targetKey !== key)
                    )),
              },
            }
          : week
      )
    );
  };

  const handleStage = (index: number, value: string) => {
    setWeeks((prev) => prev.map((week, idx) => (idx === index ? { ...week, stage: value } : week)));
  };

  const toggleNutrient = (key: string) => {
    setSelectedNutrients((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleOptimize = async () => {
    setSubmitting(true);
    try {
      const osmosisNumber = Number(osmosisShare.replace(",", "."));
      const osmosisValue = Number.isFinite(osmosisNumber)
        ? Math.min(100, Math.max(0, osmosisNumber)) / 100
        : plan.osmosisShare;
      const response = await optimizePlanWithTargets(
        weeks,
        lang,
        cultivar,
        substrate,
        Object.fromEntries(
          Object.entries(waterProfile).filter(([, value]) => typeof value === "number")
        ) as Record<string, number>,
        osmosisValue
      );
      if (!response.ok) {
        addToast({ title: "Plan Optimierung fehlgeschlagen", description: response.error.message, variant: "error" });
        return;
      }
      onApply(response.data);
      addToast({ title: "Plan Optimiert", variant: "success" });
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Plan Optimierung fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const weekRows = useMemo(() => weeks, [weeks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="glass-panel flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl p-6 text-white shadow-neon">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">AI Optimizer</p>
            <h3 className="mt-2 text-2xl font-light">Plan Optimierer</h3>
            <p className="text-sm text-white/60">Ziel-PPM definieren und AI-Plan erzeugen.</p>
          </div>
          <button
            className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70"
            onClick={handleClose}
          >
            Schliessen
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {NUTRIENTS.map((nutrient) => (
            <button
              key={nutrient}
              onClick={() => toggleNutrient(nutrient)}
              className={`rounded-full border px-4 py-1 text-xs ${
                selectedNutrients.includes(nutrient)
                  ? "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan"
                  : "border-white/10 bg-black/30 text-white/60"
              }`}
            >
              {nutrient}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Water Profile</p>
            <label className="mt-3 block text-xs text-white/60">
              Preset
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                value={presetId}
                onChange={(event) => {
                  const selected = presets.find((preset) => preset.id === event.target.value);
                  if (!selected) return;
                  setPresetId(selected.id);
                  setWaterProfile({ ...selected.waterProfile });
                  setOsmosisShare((selected.osmosisShare * 100).toFixed(1));
                }}
              >
                {presets.length ? (
                  presets.map((preset) => (
                    <option key={preset.id} value={preset.id} className="bg-[#070a16]">
                      {preset.label}
                    </option>
                  ))
                ) : (
                  <option value="default" className="bg-[#070a16]">
                    Default
                  </option>
                )}
              </select>
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {WATER_KEYS.map((key) => (
                <label key={key} className="text-xs text-white/60">
                  {key}
                  <input
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                    type="number"
                    step={0.1}
                    value={waterProfile[key] ?? ""}
                    onChange={(event) =>
                      setWaterProfile((prev) => ({
                        ...prev,
                        [key]: event.target.value.trim()
                          ? Number(event.target.value.replace(",", "."))
                          : undefined,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Osmosis Share</p>
            <label className="mt-3 block text-xs text-white/60">
              Anteil in %
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={osmosisShare}
                onChange={(event) => setOsmosisShare(event.target.value)}
              />
            </label>
            <p className="mt-3 text-xs text-white/50">
              0 = reines Leitungswasser, 100 = reines Osmosewasser.
            </p>
          </div>
        </div>

        <div className="mt-4 flex-1 overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-xs">
            <thead className="bg-black/40 text-white/60">
              <tr>
                <th className="px-3 py-2 text-left">Phase</th>
                <th className="px-3 py-2 text-left">Stage</th>
                {selectedNutrients.map((nutrient) => (
                  <th key={nutrient} className="px-3 py-2 text-right">
                    {nutrient}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekRows.map((week, index) => (
                <tr key={week.phase} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white">{week.phase}</td>
                  <td className="px-3 py-2">
                    <select
                      value={week.stage}
                      onChange={(event) => handleStage(index, event.target.value)}
                      className="rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-white"
                    >
                      {stages.map((stage) => (
                        <option key={stage} value={stage} className="bg-[#070a16]">
                          {stage}
                        </option>
                      ))}
                    </select>
                  </td>
                  {selectedNutrients.map((nutrient) => (
                    <td key={nutrient} className="px-3 py-2 text-right">
                      <input
                        className="w-20 rounded-xl border border-white/10 bg-black/40 px-2 py-1 text-right text-white"
                        type="number"
                        step={0.1}
                        value={week.targets[nutrient] ?? ""}
                        onChange={(event) => updateWeek(index, nutrient, event.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/70"
            onClick={reset}
          >
            Reset
          </button>
          <button
            className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-5 py-2 text-xs text-brand-cyan"
            onClick={handleOptimize}
            disabled={submitting}
          >
            {submitting ? "Optimiert..." : "AI Plan erzeugen"}
          </button>
        </div>
      </div>
    </div>
  );
}
