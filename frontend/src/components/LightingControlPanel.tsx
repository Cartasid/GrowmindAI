import { useEffect, useMemo, useState } from "react";

import { fetchConfig, updateConfigValue, type ConfigMap } from "../services/configService";
import { useToast } from "./ToastProvider";
import { useHaEntity } from "../hooks/useHaEntity";

const INPUT_ROLES = new Set([
  "growth_phase",
  "steering_week",
  "day_counter",
  "grow_start_date",
  "autopilot",
  "led_transition_seconds",
]);

type ConfigItem = {
  role?: string;
  label?: string;
  entity_id?: string;
  type?: string;
  unit?: string;
  value?: string | number | null;
};

type PanelStatus = "idle" | "loading" | "ready" | "error";

const parseNumber = (value: string): number | null => {
  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
};

const normalizeDateTimeValue = (raw?: string | number | null): string => {
  if (!raw) return "";
  const value = String(raw).trim();
  if (!value) return "";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
};

type InputRowProps = {
  item: ConfigItem;
  category: string;
  pendingValue: string;
  setPending: (value: string) => void;
  onSave: (value: string) => void;
  busy: boolean;
};

const InputRow = ({ item, category, pendingValue, setPending, onSave, busy }: InputRowProps) => {
  const role = item.role ?? "";
  const entityId = item.entity_id ?? "";
  const inputType = item.type ?? "input_number";
  const haEntity = useHaEntity(entityId || undefined, 8);

  const currentValue = pendingValue !== "" ? pendingValue : String(item.value ?? "");
  const statusText = (() => {
    const raw = haEntity.raw?.state ?? (item.value != null ? String(item.value) : "");
    if (!raw) return "unbekannt";
    if (raw === "on") return "an";
    if (raw === "off") return "aus";
    return String(raw);
  })();
  const statusClass =
    statusText === "an"
      ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
      : statusText === "aus"
      ? "border-white/10 bg-black/40 text-white/70"
      : "border-brand-orange/40 bg-brand-orange/10 text-brand-orange";
  const selectOptions = Array.isArray(haEntity.raw?.attributes?.options)
    ? (haEntity.raw?.attributes?.options as string[])
    : [];

  const handleSave = () => onSave(currentValue);

  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white">{item.label || role || "Unbenannt"}</p>
          <p className="text-xs text-white/50">Role: {role || "-"}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] ${statusClass}`}>
          Status: {statusText}
        </span>
        <button
          className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-1 text-xs text-brand-cyan shadow-brand-glow hover:border-brand-cyan/70"
          onClick={handleSave}
          disabled={busy || !role}
        >
          Speichern
        </button>
      </div>

      {inputType === "input_select" ? (
        <select
          value={currentValue}
          onChange={(event) => setPending(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
        >
          {selectOptions.length ? (
            selectOptions.map((option) => (
              <option key={option} value={option} className="bg-[#070a16]">
                {option}
              </option>
            ))
          ) : (
            <option value={currentValue} className="bg-[#070a16]">
              {currentValue || "-"}
            </option>
          )}
        </select>
      ) : inputType === "input_datetime" ? (
        <input
          type="datetime-local"
          value={normalizeDateTimeValue(currentValue)}
          onChange={(event) => setPending(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
        />
      ) : inputType === "input_boolean" ? (
        <label className="mt-3 inline-flex items-center gap-3 text-sm text-white/70">
          <input
            type="checkbox"
            checked={currentValue === "on" || currentValue === "true" || currentValue === "1"}
            onChange={(event) => setPending(event.target.checked ? "on" : "off")}
          />
          {item.unit ? item.unit : "Toggle"}
        </label>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            value={currentValue}
            onChange={(event) => setPending(event.target.value)}
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
          />
          {item.unit && <span className="text-xs text-white/50">{item.unit}</span>}
        </div>
      )}
    </div>
  );
};

export function LightingControlPanel() {
  const [config, setConfig] = useState<ConfigMap>({});
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchConfig()
      .then((data) => {
        if (!active) return;
        setConfig(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const systemInputs = useMemo(() => config?.system_info?.inputs ?? [], [config]);
  const lightingInputs = useMemo(() => config?.lighting_spectrum?.inputs ?? [], [config]);
  const steeringInputs = useMemo(
    () => (config?.crop_steering?.inputs ?? []).filter((item) => item?.role === "led_transition_seconds"),
    [config]
  );
  const inputs = useMemo(
    () => [...systemInputs, ...lightingInputs, ...steeringInputs].filter((item) => INPUT_ROLES.has(item.role || "")),
    [systemInputs, lightingInputs, steeringInputs]
  );

  const targetBlocks = useMemo(() => {
    const lightingTargets = config?.lighting_targets?.targets ?? [];
    const cropTargets = config?.crop_steering_targets?.targets ?? [];
    const systemTargets = config?.system_info?.targets ?? [];
    return [
      { title: "LED Tagesziel", items: lightingTargets },
      { title: "Timing", items: systemTargets },
      { title: "Crop Lichtwerte", items: cropTargets },
    ];
  }, [config]);

  const keyFor = (category: string, role: string) => `${category}:${role}`;

  const handleSave = async (category: string, item: ConfigItem, rawValue: string) => {
    const role = item.role ?? "";
    if (!role) return;
    const key = keyFor(category, role);
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      let payloadValue: string | number | boolean | { date?: string; time?: string } | null = rawValue;
      if (item.type === "input_number") {
        const numeric = parseNumber(rawValue);
        if (numeric == null) throw new Error("Ungueltiger Zahlenwert");
        payloadValue = numeric;
      }
      if (item.type === "input_boolean") {
        payloadValue = rawValue === "on" || rawValue === "true" || rawValue === "1";
      }
      await updateConfigValue({ category, role, value: payloadValue });
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      addToast({ title: "Lichtsteuerung gespeichert", description: item.label || role, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "Update fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Lighting</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Lichtsteuerung</h2>
          <p className="mt-2 text-sm text-white/60">Ziele, Autopilot und Wochenlogik.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">
          {status === "loading" ? "Laedt" : status === "error" ? "Fehler" : "Bereit"}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-xs text-brand-red">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Steuerung</p>
          <div className="grid gap-3">
            {inputs.map((item) => {
              const role = item.role ?? "";
              const category =
                (config.system_info?.inputs ?? []).includes(item)
                  ? "system_info"
                  : (config.lighting_spectrum?.inputs ?? []).includes(item)
                  ? "lighting_spectrum"
                  : "crop_steering";
              const key = keyFor(category, role);
              const pendingValue = pending[key] ?? "";
              return (
                <InputRow
                  key={key}
                  item={item}
                  category={category}
                  pendingValue={pendingValue}
                  setPending={(value) => setPending((prev) => ({ ...prev, [key]: value }))}
                  onSave={(value) => handleSave(category, item, value)}
                  busy={Boolean(saving[key])}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {targetBlocks.map((block) => (
            <div key={block.title} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">{block.title}</p>
              <div className="mt-3 space-y-2 text-sm text-white/70">
                {block.items.map((item) => (
                  <div key={item.role || item.label} className="flex items-center justify-between">
                    <span>{item.label || item.role}</span>
                    <span className="text-white">
                      {item.value ?? "—"} {item.unit || ""}
                    </span>
                  </div>
                ))}
                {block.items.length === 0 && <p className="text-xs text-white/50">Keine Daten</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
