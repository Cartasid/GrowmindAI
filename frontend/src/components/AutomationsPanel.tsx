import { useEffect, useState } from "react";

import { fetchAutomations, setAutomationEnabled, type AutomationSummary } from "../services/automationService";
import { useToast } from "./ToastProvider";

type PanelStatus = "idle" | "loading" | "ready" | "error";

export function AutomationsPanel() {
  const [automations, setAutomations] = useState<AutomationSummary[]>([]);
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();

  const loadAutomations = () => {
    setStatus("loading");
    fetchAutomations()
      .then((data) => {
        setAutomations(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  };

  useEffect(() => {
    loadAutomations();
  }, []);

  const handleToggle = async (automation: AutomationSummary) => {
    const key = automation.entity_id;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const enabled = automation.state !== "on";
      await setAutomationEnabled(automation.entity_id, enabled);
      addToast({
        title: "Automation aktualisiert",
        description: `${automation.name} ${enabled ? "aktiv" : "deaktiviert"}`,
        variant: "success",
      });
      loadAutomations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({ title: "Automation fehlgeschlagen", description: message, variant: "error" });
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Automation</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Automations</h2>
          <p className="mt-2 text-sm text-white/60">Ein/Aus und Status der Home Assistant Regeln.</p>
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

      <div className="mt-6 grid gap-3">
        {automations.map((automation) => (
          <div key={automation.entity_id} className="glass-card flex items-center justify-between rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm text-white">{automation.name}</p>
              <p className="text-xs text-white/50">{automation.entity_id}</p>
            </div>
            <button
              className={`rounded-full border px-4 py-1 text-xs shadow-brand-glow ${
                automation.state === "on"
                  ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                  : "border-white/10 bg-black/40 text-white/70"
              }`}
              onClick={() => handleToggle(automation)}
              disabled={Boolean(saving[automation.entity_id])}
            >
              {automation.state === "on" ? "Aktiv" : "Inaktiv"}
            </button>
          </div>
        ))}
        {status === "ready" && automations.length === 0 && (
          <p className="text-sm text-white/60">Keine Automationen gefunden.</p>
        )}
      </div>
    </section>
  );
}
