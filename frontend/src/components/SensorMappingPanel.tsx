import { useEffect, useMemo, useState } from "react";
import {
  fetchConfig,
  fetchMappingOverrides,
  fetchSystemInfo,
  importMappingOverrides,
  updateMapping,
  type ConfigMap,
  type MappingOverrides,
  type SystemInfo,
} from "../services/configService";
import { useToast } from "./ToastProvider";

const sectionOrder = ["inputs", "targets"] as const;

type MappingStatus = "idle" | "loading" | "ready" | "error";

export function SensorMappingPanel() {
  const [config, setConfig] = useState<ConfigMap>({});
  const [status, setStatus] = useState<MappingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
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
    fetchSystemInfo()
      .then((info) => {
        if (active) setSystemInfo(info);
      })
      .catch(() => {
        if (active) setSystemInfo(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => Object.entries(config || {}), [config]);

  const keyFor = (category: string, section: string, role: string) => `${category}:${section}:${role}`;

  const handleSave = async (category: string, section: "inputs" | "targets", role: string) => {
    const key = keyFor(category, section, role);
    const entity_id = (pending[key] ?? "").trim();
    try {
      await updateMapping({ category, section, role, entity_id });
      setConfig((prev) => {
        const next = { ...prev };
        const items = next?.[category]?.[section] ?? [];
        next[category] = { ...next[category], [section]: items.map((item) => {
          if (item.role !== role) return item;
          return { ...item, entity_id: entity_id || undefined };
        }) };
        return next;
      });
      setPending((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setError(null);
      addToast({
        title: "Mapping gespeichert",
        description: `${role} → ${entity_id || "Standard"}`,
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({
        title: "Mapping fehlgeschlagen",
        description: message,
        variant: "error",
      });
    }
  };

  const handleExport = async () => {
    try {
      const overrides = await fetchMappingOverrides();
      const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "mapping_overrides.json";
      link.click();
      URL.revokeObjectURL(link.href);
      addToast({ title: "Mapping exportiert", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Export fehlgeschlagen", description: message, variant: "error" });
    }
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const overrides = JSON.parse(text) as MappingOverrides;
      await importMappingOverrides(overrides);
      const data = await fetchConfig();
      setConfig(data);
      addToast({ title: "Mapping importiert", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: "Import fehlgeschlagen", description: message, variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Sensor Mapping</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Entity-Konfiguration</h2>
          <p className="mt-2 text-sm text-white/60">
            Entitaeten lassen sich pro Rolle anpassen. Leeres Feld setzt auf Standard.
          </p>
        </div>
        <span className="brand-chip normal-case text-[10px]">
          {status === "loading" ? "Laedt" : status === "error" ? "Fehler" : "Bereit"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-1 text-xs text-brand-cyan shadow-brand-glow hover:border-brand-cyan/70"
          onClick={handleExport}
        >
          Export
        </button>
        <label className="rounded-full border border-white/20 bg-black/30 px-4 py-1 text-xs text-white/70 hover:border-brand-cyan/30">
          Import
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => handleImport(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {systemInfo && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-white/70">
          <p className="meta-mono text-[10px] text-white/40">SYSTEM</p>
          <div className="mt-2 space-y-1">
            <p>GEMINI_SAFETY_THRESHOLD: {systemInfo.gemini_safety_threshold}</p>
            <p>LOG_FORMAT: {systemInfo.log_format}</p>
            <p>CORS: {systemInfo.cors_allowed_origins.join(", ") || "(leer)"}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {categories.map(([categoryKey, category]) => (
          <div key={categoryKey} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">{category.label || categoryKey}</p>
            <div className="mt-4 space-y-4">
              {sectionOrder.map((section) => {
                const items = category?.[section] ?? [];
                if (!items.length) return null;
                return (
                  <div key={section} className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">{section}</p>
                    <div className="grid gap-3">
                      {items.map((item) => {
                        const role = item.role || "";
                        const key = keyFor(categoryKey, section, role);
                        const value = pending[key] ?? (item.entity_id || "");
                        return (
                          <div key={key} className="glass-card rounded-2xl px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm text-white">{item.label || role || "Unbenannt"}</p>
                                <p className="text-xs text-white/50">Role: {role || "-"}</p>
                              </div>
                              <button
                                className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-1 text-xs text-brand-cyan shadow-brand-glow hover:border-brand-cyan/70"
                                onClick={() => handleSave(categoryKey, section, role)}
                                disabled={!role}
                              >
                                Speichern
                              </button>
                            </div>
                            <input
                              value={value}
                              onChange={(event) =>
                                setPending((prev) => ({
                                  ...prev,
                                  [key]: event.target.value,
                                }))
                              }
                              placeholder="sensor.my_entity_id"
                              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white focus:border-brand-cyan/60 focus:outline-none focus:ring-1 focus:ring-brand-cyan/30"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {status === "ready" && categories.length === 0 && (
          <p className="text-sm text-white/60">Keine Konfiguration geladen.</p>
        )}
      </div>
    </section>
  );
}
