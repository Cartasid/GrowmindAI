import { useEffect, useMemo, useState } from "react";
import { fetchConfig, updateConfigValue, type ConfigMap } from "../services/configService";
import { useToast } from "./ToastProvider";
import { useHaEntity } from "../hooks/useHaEntity";

const ROLE_RANGES: Record<string, { min: number; max: number; step: number }> = {
  substrate_ec: { min: 0.5, max: 6, step: 0.1 },
  drain_target: { min: 0, max: 20, step: 0.5 },
  dryback_night: { min: 0, max: 20, step: 0.5 },
  dryback_day: { min: 0, max: 20, step: 0.5 },
  irrigation_amount: { min: 0, max: 500, step: 5 },
  vwc_target: { min: 0, max: 80, step: 0.5 },
  led_target: { min: 0, max: 24, step: 0.5 },
  co2_target: { min: 0, max: 2000, step: 25 },
  ph_target: { min: 4.5, max: 7.5, step: 0.05 },
  p0_duration: { min: 0, max: 120, step: 1 },
  drain_ec: { min: 0, max: 6, step: 0.1 },
  target_ec: { min: 0, max: 6, step: 0.1 },
  led_transition_seconds: { min: 0, max: 1200, step: 5 },
};

type ConfigItem = {
  role?: string;
  label?: string;
  entity_id?: string;
  type?: string;
  unit?: string;
  value?: string | number | null;
};

type InputRowProps = {
  item: ConfigItem;
  category: string;
  pendingValue: string;
  setPending: (value: string) => void;
  onSave: (value: string) => void;
  busy: boolean;
};

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

const InputRow = ({ item, category, pendingValue, setPending, onSave, busy }: InputRowProps) => {
  const role = item.role ?? "";
  const entityId = item.entity_id ?? "";
  const inputType = item.type ?? "input_number";
  const range = ROLE_RANGES[role] ?? { min: 0, max: 100, step: 0.1 };
  const haEntity = useHaEntity(entityId || undefined, 8);

  const currentValue = pendingValue !== "" ? pendingValue : String(item.value ?? "");
  const numericValue = parseNumber(currentValue);
  const selectOptions = Array.isArray(haEntity.raw?.attributes?.options)
    ? (haEntity.raw?.attributes?.options as string[])
    : [];

  const handleSave = () => {
    onSave(currentValue);
  };

  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white">{item.label || role || "Unbenannt"}</p>
          <p className="text-xs text-white/50">Role: {role || "-"}</p>
        </div>
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
        <div className="mt-3 space-y-3">
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={numericValue ?? range.min}
            onChange={(event) => setPending(event.target.value)}
            className="w-full accent-brand-cyan"
          />
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={currentValue}
              onChange={(event) => setPending(event.target.value)}
              className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
            />
            {item.unit && <span className="text-xs text-white/50">{item.unit}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

type TargetCardProps = {
  item: ConfigItem;
};

const TargetCard = ({ item }: TargetCardProps) => {
  const entityId = item.entity_id ?? "";
  const ha = useHaEntity(entityId || undefined, 8);
  const value = ha.raw?.state ?? item.value ?? "-";
  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{item.label || item.role}</p>
      <p className="mt-2 text-lg text-white">
        {String(value)} {item.unit || ""}
      </p>
      {item.role && <p className="text-xs text-white/40">{item.role}</p>}
    </div>
  );
};

export function CropSteeringPanel() {
  const [config, setConfig] = useState<ConfigMap>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
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
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const systemInputs = useMemo(() => config?.system_info?.inputs ?? [], [config]);
  const steeringInputs = useMemo(() => config?.crop_steering?.inputs ?? [], [config]);
  const steeringTargets = useMemo(() => config?.crop_steering_targets?.targets ?? [], [config]);
  const liveTargets = useMemo(() => config?.live_sensors?.targets ?? [], [config]);

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
      addToast({ title: "Crop Steering gespeichert", description: `${item.label || role}`, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "Update fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const renderInputs = (category: string, items: ConfigItem[]) =>
    items.map((item) => {
      const role = item.role ?? "";
      const key = keyFor(category, role);
      return (
        <InputRow
          key={key}
          item={item}
          category={category}
          pendingValue={pending[key] ?? ""}
          setPending={(value) => setPending((prev) => ({ ...prev, [key]: value }))}
          onSave={(value) => handleSave(category, item, value)}
          busy={Boolean(saving[key])}
        />
      );
    });

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Crop Steering</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Crop Steering Kontrolle</h2>
          <p className="mt-2 text-sm text-white/60">
            Regler, Hilfssensoren und Target-Werte fuer die Bewaesserungsstrategie.
          </p>
        </div>
        <span className="brand-chip normal-case text-[10px]">
          {status === "loading" ? "Laedt" : status === "error" ? "Fehler" : "Bereit"}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">Steering Inputs</p>
            <div className="mt-4 space-y-4">{renderInputs("crop_steering", steeringInputs)}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">Phase & Woche</p>
            <div className="mt-4 space-y-4">{renderInputs("system_info", systemInputs)}</div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">Hilfssensoren</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {liveTargets.map((item) => (
                <TargetCard key={item.role || item.label} item={item} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">Crop Steering Targets</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {steeringTargets.map((item) => (
                <TargetCard key={item.role || item.label} item={item} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
