import { useEffect, useMemo, useState } from "react";

import { fetchConfig, updateConfigValue, type ConfigMap } from "../services/configService";
import { useHaEntity } from "../hooks/useHaEntity";
import { useToast } from "./ToastProvider";

const CONTROL_SECTIONS = [
  {
    key: "climate_controls",
    title: "Klima Regler",
    description: "Setpoints und HVAC-Modi fuer die Growbox.",
  },
  {
    key: "climate_actuators",
    title: "Klima Aktoren",
    description: "Direkte Kontrolle von Heizern, Entfeuchtern und Ventilatoren.",
  },
  {
    key: "irrigation_controls",
    title: "Bewaesserung",
    description: "Manuelle Pulse, Drain- und Flush-Aktionen.",
  },
  {
    key: "co2_controls",
    title: "CO2 Steuerung",
    description: "CO2 Zielwerte und Aktivierung.",
  },
  {
    key: "safety_controls",
    title: "Safety & Modes",
    description: "Sicherheitsmodi, Szenen und Alarme.",
  },
];

const ACTION_TYPES = new Set(["button", "script", "scene"]);
const TOGGLE_TYPES = new Set(["input_boolean", "switch", "light", "fan"]);
const SELECT_TYPES = new Set(["input_select", "select", "climate_mode"]);
const NUMBER_TYPES = new Set([
  "input_number",
  "number",
  "fan_percentage",
  "climate_temperature",
  "climate_humidity",
  "humidifier_target",
]);

const TYPE_RANGES: Record<string, { min: number; max: number; step: number }> = {
  fan_percentage: { min: 0, max: 100, step: 1 },
  climate_temperature: { min: 16, max: 35, step: 0.5 },
  climate_humidity: { min: 30, max: 80, step: 1 },
  humidifier_target: { min: 30, max: 80, step: 1 },
};

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

const resolveOptions = (type: string | undefined, haEntity: ReturnType<typeof useHaEntity>) => {
  if (!type) return [] as string[];
  const attributes = haEntity.raw?.attributes as Record<string, unknown> | undefined;
  if (!attributes) return [] as string[];
  const options = attributes.options;
  if (Array.isArray(options)) {
    return options.map((value) => String(value));
  }
  if (type === "climate_mode") {
    const modes = attributes.hvac_modes;
    if (Array.isArray(modes)) {
      return modes.map((value) => String(value));
    }
  }
  return [] as string[];
};

function ControlRow({
  item,
  category,
  pendingValue,
  setPending,
  onSave,
  onAction,
  busy,
}: {
  item: ConfigItem;
  category: string;
  pendingValue: string;
  setPending: (value: string) => void;
  onSave: (value: string) => void;
  onAction: () => void;
  busy: boolean;
}) {
  const type = item.type ?? "input_number";
  const entityId = item.entity_id ?? "";
  const haEntity = useHaEntity(entityId || undefined, 8);
  const currentValue = pendingValue !== "" ? pendingValue : String(item.value ?? haEntity.raw?.state ?? "");
  const options = resolveOptions(type, haEntity);
  const range = TYPE_RANGES[type] ?? { min: 0, max: 100, step: 1 };
  const isAction = ACTION_TYPES.has(type);
  const isToggle = TOGGLE_TYPES.has(type);
  const isSelect = SELECT_TYPES.has(type);
  const isNumber = NUMBER_TYPES.has(type);

  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white">{item.label || item.role || "Unbenannt"}</p>
          <p className="text-xs text-white/50">Role: {item.role || "-"}</p>
        </div>
        {isAction ? (
          <button
            className="rounded-full border border-brand-orange/40 bg-brand-orange/10 px-4 py-1 text-xs text-brand-orange shadow-brand-glow"
            onClick={onAction}
            disabled={busy || !item.role}
          >
            Ausloesen
          </button>
        ) : (
          <button
            className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-1 text-xs text-brand-cyan shadow-brand-glow"
            onClick={() => onSave(currentValue)}
            disabled={busy || !item.role}
          >
            Speichern
          </button>
        )}
      </div>

      {isAction ? null : isSelect ? (
        <select
          value={currentValue}
          onChange={(event) => setPending(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
        >
          {options.length ? (
            options.map((option) => (
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
      ) : isToggle ? (
        <label className="mt-3 inline-flex items-center gap-3 text-sm text-white/70">
          <input
            type="checkbox"
            checked={currentValue === "on" || currentValue === "true" || currentValue === "1"}
            onChange={(event) => setPending(event.target.checked ? "on" : "off")}
          />
          {item.unit ? item.unit : "Toggle"}
        </label>
      ) : isNumber ? (
        <div className="mt-3 space-y-3">
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={parseNumber(currentValue) ?? range.min}
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
      ) : (
        <input
          type="text"
          value={currentValue}
          onChange={(event) => setPending(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
        />
      )}
    </div>
  );
}

export function ControlCenterPanel() {
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

  const keyFor = (category: string, role: string) => `${category}:${role}`;

  const handleSave = async (category: string, item: ConfigItem, rawValue: string) => {
    const role = item.role ?? "";
    if (!role) return;
    const key = keyFor(category, role);
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      let payloadValue: string | number | boolean | null = rawValue;
      if (NUMBER_TYPES.has(item.type ?? "")) {
        const numeric = parseNumber(rawValue);
        if (numeric == null) throw new Error("Ungueltiger Zahlenwert");
        payloadValue = numeric;
      }
      if (TOGGLE_TYPES.has(item.type ?? "")) {
        payloadValue = rawValue === "on" || rawValue === "true" || rawValue === "1";
      }
      await updateConfigValue({ category, role, value: payloadValue });
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      addToast({ title: "Kontrolle gespeichert", description: item.label || role, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "Update fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleAction = async (category: string, item: ConfigItem) => {
    const role = item.role ?? "";
    if (!role) return;
    const key = keyFor(category, role);
    setSaving((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      await updateConfigValue({ category, role, value: true });
      addToast({ title: "Aktion gesendet", description: item.label || role, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "Aktion fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const sections = useMemo(
    () =>
      CONTROL_SECTIONS.map((section) => ({
        ...section,
        items: config?.[section.key]?.inputs ?? [],
      })).filter((section) => section.items.length > 0),
    [config]
  );

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Control Center</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Growbox Steuerung</h2>
          <p className="mt-2 text-sm text-white/60">State-of-the-art Controls fuer Klima, CO2 und Bewaesserung.</p>
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <div key={section.key} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">{section.title}</p>
            <p className="mt-2 text-xs text-white/50">{section.description}</p>
            <div className="mt-4 space-y-4">
              {section.items.map((item) => {
                const key = keyFor(section.key, item.role ?? "");
                return (
                  <ControlRow
                    key={key}
                    item={item}
                    category={section.key}
                    pendingValue={pending[key] ?? ""}
                    setPending={(value) => setPending((prev) => ({ ...prev, [key]: value }))}
                    onSave={(value) => handleSave(section.key, item, value)}
                    onAction={() => handleAction(section.key, item)}
                    busy={Boolean(saving[key])}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {sections.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
            Keine Steuerungen konfiguriert. Bitte mapping.json oder Sensor-Mapping pruefen.
          </div>
        )}
      </div>
    </section>
  );
}
