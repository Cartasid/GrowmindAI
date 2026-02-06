import { useEffect, useMemo, useState } from "react";
import { fetchConfig, updateMapping, type ConfigMap } from "../services/configService";

const sectionOrder = ["inputs", "targets"] as const;

type MappingStatus = "idle" | "loading" | "ready" | "error";

export function SensorMappingPanel() {
  const [config, setConfig] = useState<ConfigMap>({});
  const [status, setStatus] = useState<MappingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
