import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchConfig,
  runHvacAuto,
  updateConfigValue,
  type ConfigMap,
  type HvacAutoResult,
} from "../services/configService";
import { fetchAutomations, setAutomationEnabled, type AutomationSummary } from "../services/automationService";
import { useHaEntity } from "../hooks/useHaEntity";
import { useToast } from "./ToastProvider";

const CONTROL_SECTIONS = [
  {
    key: "climate_controls",
    title: "Klima Regler",
    description: "Setpoints fuer die Growbox.",
  },
  {
    key: "climate_actuators",
    title: "Klima Aktoren",
    description: "Direkte Kontrolle von Heizern, Entfeuchtern und Ventilatoren.",
  },
  {
    key: "irrigation_controls",
    title: "Bewaesserung",
    description: "Manuelle Pulse und Flush-Aktionen fuer die Bewaesserung.",
  },
  {
    key: "co2_controls",
    title: "CO2 Steuerung",
    description: "CO2 Zielwerte und Aktivierung.",
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

type HvacMode = "auto_ai" | "manual" | "app_auto";

type HvacAutoStatus = {
  lastRun: string;
  ok: boolean;
  summary: string;
  inputs: HvacAutoResult["inputs"];
};

const HVAC_MODE_STORAGE_KEY = "growmind.hvac_mode";
const HVAC_AUTOMATION_STORAGE_KEY = "growmind.hvac_automation";

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

const formatStatus = (
  value: string | null | undefined,
  type: string | undefined,
  attributes?: Record<string, unknown>
) => {
  if (type === "fan_percentage") {
    const raw = attributes?.percentage;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return `${Math.round(numeric)}%`;
  }
  if (!value) return "unbekannt";
  if (value === "on") return "an";
  if (value === "off") return "aus";
  return value;
};

const formatAutoSummary = (decisions?: HvacAutoResult["decisions"]) => {
  if (!decisions) return "Keine Daten";
  const parts = [
    `Heizung ${decisions.heater_on ? "an" : "aus"}`,
    `AC ${decisions.ac_on ? "an" : "aus"}`,
    `Entfeuchter ${decisions.dehumidifier_on ? "an" : "aus"}`,
    `Befeuchter ${decisions.humidifier_on ? "an" : "aus"}`,
    `Luefter ${Math.round(decisions.fan_target)}%`,
  ];
  return parts.join(", ");
};

const formatAutoInputs = (inputs?: HvacAutoResult["inputs"]) => {
  if (!inputs) return "-";
  const temp =
    inputs.temp_actual != null && inputs.temp_target != null
      ? `Temp ${inputs.temp_actual.toFixed(1)}/${inputs.temp_target.toFixed(1)}C`
      : null;
  const hum =
    inputs.hum_actual != null && inputs.hum_target != null
      ? `RH ${inputs.hum_actual.toFixed(0)}/${inputs.hum_target.toFixed(0)}%`
      : null;
  return [temp, hum].filter(Boolean).join(" · ") || "-";
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
  const statusText = formatStatus(
    haEntity.raw?.state ?? (item.value != null ? String(item.value) : null),
    type,
    haEntity.raw?.attributes as Record<string, unknown> | undefined
  );
  const statusClass =
    statusText === "an"
      ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
      : statusText === "aus"
      ? "border-white/10 bg-black/40 text-white/70"
      : "border-brand-orange/40 bg-brand-orange/10 text-brand-orange";

  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white">{item.label || item.role || "Unbenannt"}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] ${statusClass}`}>
          Status: {statusText}
        </span>
        {isAction ? (
          <button
            className="rounded-full border border-brand-orange/40 bg-brand-orange/10 px-4 py-1 text-xs text-brand-orange shadow-brand-glow"
            onClick={onAction}
            disabled={busy || !item.role}
          >
            Ausloesen
          </button>
        ) : !isToggle ? (
          <button
            className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-1 text-xs text-brand-cyan shadow-brand-glow"
            onClick={() => onSave(currentValue)}
            disabled={busy || !item.role}
          >
            Speichern
          </button>
        ) : null}
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
            onChange={(event) => {
              const nextValue = event.target.checked ? "on" : "off";
              setPending(nextValue);
              onSave(nextValue);
            }}
            disabled={busy || !item.role}
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
  const [hvacMode, setHvacMode] = useState<HvacMode>(() => {
    if (typeof window === "undefined") return "auto_ai";
    const stored = window.localStorage.getItem(HVAC_MODE_STORAGE_KEY) as HvacMode | null;
    return stored || "auto_ai";
  });
  const [hvacAutomationId, setHvacAutomationId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(HVAC_AUTOMATION_STORAGE_KEY) || "";
  });
  const [automations, setAutomations] = useState<AutomationSummary[]>([]);
  const [automationStatus, setAutomationStatus] = useState<PanelStatus>("idle");
  const { addToast } = useToast();
  const lastAutoErrorRef = useRef(0);
  const [autoStatus, setAutoStatus] = useState<HvacAutoStatus | null>(null);

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

  useEffect(() => {
    let active = true;
    setAutomationStatus("loading");
    fetchAutomations()
      .then((data) => {
        if (!active) return;
        setAutomations(data);
        setAutomationStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setAutomationStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HVAC_MODE_STORAGE_KEY, hvacMode);
  }, [hvacMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hvacAutomationId) {
      window.localStorage.setItem(HVAC_AUTOMATION_STORAGE_KEY, hvacAutomationId);
    }
  }, [hvacAutomationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hvacMode !== "app_auto") return;
    let active = true;

    const runAuto = async () => {
      try {
        const result = await runHvacAuto();
        setAutoStatus({
          lastRun: new Date().toLocaleTimeString(),
          ok: true,
          summary: formatAutoSummary(result.decisions),
          inputs: result.inputs,
        });
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setAutoStatus((prev) =>
          prev
            ? { ...prev, ok: false }
            : {
                lastRun: new Date().toLocaleTimeString(),
                ok: false,
                summary: "Fehler",
                inputs: { temp_actual: null, temp_target: null, hum_actual: null, hum_target: null },
              }
        );
        const now = Date.now();
        if (now - lastAutoErrorRef.current > 60_000) {
          lastAutoErrorRef.current = now;
          addToast({ title: "HVAC Auto Fehler", description: message, variant: "error" });
        }
      }
    };

    runAuto();
    const timer = window.setInterval(runAuto, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [addToast, hvacMode]);

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

  const applyAppAutoSetpoints = async () => {
    const climateItems = config?.climate_controls?.inputs ?? [];
    const tempItem = climateItems.find((item) => item.role === "temp_setpoint");
    const humidityItem = climateItems.find((item) => item.role === "humidity_setpoint");
    if (tempItem?.value != null) {
      await updateConfigValue({ category: "climate_controls", role: "temp_setpoint", value: tempItem.value });
    }
    if (humidityItem?.value != null) {
      await updateConfigValue({ category: "climate_controls", role: "humidity_setpoint", value: humidityItem.value });
    }
  };

  const handleHvacModeChange = async (nextMode: HvacMode) => {
    setHvacMode(nextMode);
    if (!hvacAutomationId) return;
    try {
      if (nextMode === "manual" || nextMode === "app_auto") {
        await setAutomationEnabled(hvacAutomationId, false);
      } else {
        await setAutomationEnabled(hvacAutomationId, true);
      }
      if (nextMode === "app_auto") {
        await applyAppAutoSetpoints();
      }
      addToast({ title: "HVAC Mode aktualisiert", description: nextMode, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "HVAC Mode fehlgeschlagen", description: message, variant: "error" });
    }
  };

  const sections = useMemo(
    () =>
      CONTROL_SECTIONS.map((section) => {
        const items = config?.[section.key]?.inputs ?? [];
        const filtered =
          section.key === "climate_controls"
            ? items.filter((item) => item.role !== "hvac_mode")
            : items;
        return {
          ...section,
          items: filtered,
        };
      }).filter((section) => section.items.length > 0),
    [config]
  );

  const substrateEcTarget = useMemo(() => {
    const items = config?.crop_steering?.inputs ?? [];
    const ecItem = items.find((item) => item.role === "substrate_ec");
    const numeric = parseNumber(String(ecItem?.value ?? ""));
    return numeric != null ? numeric : null;
  }, [config]);

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
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 lg:col-span-2">
          <p className="meta-mono text-[11px] text-white/50">HVAC Mode</p>
          <p className="mt-2 text-xs text-white/50">
            Auto (AI) nutzt die ausgewaehlte Automation. Manuell deaktiviert sie. App Auto steuert die Setpoints direkt.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/60">
              Modus
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                value={hvacMode}
                onChange={(event) => handleHvacModeChange(event.target.value as HvacMode)}
              >
                <option value="auto_ai" className="bg-[#070a16]">Auto (AI)</option>
                <option value="manual" className="bg-[#070a16]">Manuell</option>
                <option value="app_auto" className="bg-[#070a16]">App Auto</option>
              </select>
            </label>
            <label className="text-xs text-white/60">
              Klima-Automation
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                value={hvacAutomationId}
                onChange={(event) => setHvacAutomationId(event.target.value)}
              >
                <option value="" className="bg-[#070a16]">
                  {automationStatus === "loading" ? "Laedt..." : "Bitte auswaehlen"}
                </option>
                {automations.map((automation) => (
                  <option key={automation.entity_id} value={automation.entity_id} className="bg-[#070a16]">
                    {automation.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hvacMode === "app_auto" && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-[11px] text-white/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>App Auto Status</span>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] ${
                    autoStatus?.ok
                      ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                      : "border-brand-orange/40 bg-brand-orange/10 text-brand-orange"
                  }`}
                >
                  {autoStatus?.ok ? "AKTIV" : "WARNUNG"}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/60">Letzter Lauf: {autoStatus?.lastRun ?? "-"}</p>
              <p className="mt-1 text-xs text-white/50">{formatAutoInputs(autoStatus?.inputs)}</p>
              <p className="mt-1 text-xs text-white/50">{autoStatus?.summary ?? "-"}</p>
            </div>
          )}
        </div>
        {sections.map((section) => (
          <div key={section.key} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">{section.title}</p>
            <p className="mt-2 text-xs text-white/50">{section.description}</p>
            {section.key === "irrigation_controls" && substrateEcTarget != null && (
              <p className="mt-2 text-xs text-white/60">
                Substrate EC Ziel: {substrateEcTarget.toFixed(2)} mS/cm
              </p>
            )}
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
