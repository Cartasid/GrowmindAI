import { useEffect, useMemo, useState } from "react";

import { fetchConfig, type ConfigMap } from "../services/configService";
import { generateSteeringCopilot, type SteeringCopilotResponse } from "../services/aiService";
import { saveAlert, saveRule, type AlertConfig, type Rule } from "../services/operationsService";
import { useToast } from "./ToastProvider";

const buildTargetsSnapshot = (config: ConfigMap | null) => {
  if (!config) return {} as Record<string, unknown>;
  const snapshot: Record<string, unknown> = {};
  Object.values(config).forEach((category) => {
    const targets = Array.isArray(category?.targets) ? category.targets : [];
    targets.forEach((item) => {
      if (!item?.role) return;
      snapshot[item.role] = item.value ?? null;
    });
  });
  return snapshot;
};

const buildInputsSnapshot = (config: ConfigMap | null) => {
  if (!config) return {} as Record<string, unknown>;
  const snapshot: Record<string, unknown> = {};
  Object.values(config).forEach((category) => {
    const inputs = Array.isArray(category?.inputs) ? category.inputs : [];
    inputs.forEach((item) => {
      if (!item?.role) return;
      snapshot[item.role] = item.value ?? null;
    });
  });
  return snapshot;
};

export function CropSteeringCopilotPanel() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [objectives, setObjectives] = useState<string>("Mehr Dryback, stabile VPD und sanfter EC-Anstieg");
  const [constraints, setConstraints] = useState<string>("Nur kleine Anpassungen pro Tag, keine Nachtbewaesserung");
  const [phase, setPhase] = useState<string>("Vegetative");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SteeringCopilotResponse | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch(() => {
        if (active) setConfig(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const targets = useMemo(() => buildTargetsSnapshot(config), [config]);
  const current = useMemo(() => buildInputsSnapshot(config), [config]);

  const handleGenerate = async () => {
    setLoading(true);
    const response = await generateSteeringCopilot({
      lang: "de",
      phase,
      objectives: objectives.split(";").map((item) => item.trim()).filter(Boolean),
      constraints: constraints.split(";").map((item) => item.trim()).filter(Boolean),
      targets,
      current,
    });
    if (!response.ok) {
      addToast({ title: "Copilot fehlgeschlagen", description: response.error.message, variant: "error" });
      setLoading(false);
      return;
    }
    setResult(response.data);
    setLoading(false);
  };

  const handleSaveRule = async (rule: Rule) => {
    try {
      await saveRule(rule);
      addToast({ title: "Rule gespeichert", description: rule.name, variant: "success" });
    } catch (err) {
      addToast({ title: "Rule speichern fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const handleSaveAlert = async (alert: AlertConfig) => {
    try {
      await saveAlert(alert);
      addToast({ title: "Alert gespeichert", description: alert.name, variant: "success" });
    } catch (err) {
      addToast({ title: "Alert speichern fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const handleSaveAll = async () => {
    if (!result) return;
    try {
      await Promise.all([
        ...result.rules.map((rule) =>
          saveRule({
            name: rule.name,
            enabled: true,
            when: rule.when,
            then: rule.then,
            priority: rule.priority ?? "medium",
          })
        ),
        ...result.alerts.map((alert) =>
          saveAlert({
            name: alert.name,
            metric: alert.metric,
            operator: alert.operator,
            threshold: alert.threshold,
            severity: alert.severity ?? "warning",
            enabled: true,
          })
        ),
      ]);
      addToast({ title: "Alles gespeichert", variant: "success" });
    } catch (err) {
      addToast({ title: "Speichern fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Copilot</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Crop Steering Copilot</h2>
          <p className="mt-2 text-sm text-white/60">KI-Regel-Engine fuer klare Steuerungslogik.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Analysiert" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Ziele & Grenzen</p>
          <div className="mt-4 space-y-3">
            <input
              value={phase}
              onChange={(event) => setPhase(event.target.value)}
              placeholder="Phase (z.B. Vegetative)"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <textarea
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
              placeholder="Ziele (mit ; trennen)"
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <textarea
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              placeholder="Grenzen (mit ; trennen)"
              rows={2}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <button
              className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? "Copilot laeuft..." : "Copilot starten"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {result?.summary && (
            <div className="glass-card rounded-2xl px-4 py-3 text-sm text-white/70">{result.summary}</div>
          )}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">Rules</p>
            {result?.rules?.length ? (
              <button
                className="mt-2 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-[10px] text-brand-cyan"
                onClick={handleSaveAll}
              >
                Alles speichern
              </button>
            ) : null}
            <div className="mt-3 space-y-3">
              {(result?.rules ?? []).map((rule, index) => (
                <div key={`${rule.name}-${index}`} className="glass-card rounded-2xl px-4 py-3">
                  <p className="text-sm text-white">{rule.name}</p>
                  <p className="text-xs text-white/60">{rule.when} → {rule.then}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] text-white/50">Priority: {rule.priority ?? "medium"}</span>
                    <button
                      className="rounded-full border border-grow-lime/40 bg-grow-lime/10 px-3 py-1 text-xs text-grow-lime"
                      onClick={() =>
                        handleSaveRule({
                          name: rule.name,
                          enabled: true,
                          when: rule.when,
                          then: rule.then,
                          priority: rule.priority ?? "medium",
                        })
                      }
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              ))}
              {!result?.rules?.length && <p className="text-sm text-white/60">Noch keine Regeln generiert.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="meta-mono text-[11px] text-white/50">Alerts</p>
            <div className="mt-3 space-y-3">
              {(result?.alerts ?? []).map((alert, index) => (
                <div key={`${alert.name}-${index}`} className="glass-card rounded-2xl px-4 py-3">
                  <p className="text-sm text-white">{alert.name}</p>
                  <p className="text-xs text-white/60">{alert.metric} {alert.operator} {alert.threshold}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] text-white/50">Severity: {alert.severity ?? "warning"}</span>
                    <button
                      className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-xs text-brand-cyan"
                      onClick={() =>
                        handleSaveAlert({
                          name: alert.name,
                          metric: alert.metric,
                          operator: alert.operator,
                          threshold: alert.threshold,
                          severity: alert.severity ?? "warning",
                          enabled: true,
                        })
                      }
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              ))}
              {!result?.alerts?.length && <p className="text-sm text-white/60">Noch keine Alerts generiert.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
