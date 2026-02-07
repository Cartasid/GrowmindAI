import { useEffect, useMemo, useState } from "react";

import { deleteRule, fetchRules, saveRule, type Rule } from "../services/operationsService";
import { fetchConfig, updateConfigValue, type ConfigMap } from "../services/configService";
import { useToast } from "./ToastProvider";

const emptyRule: Rule = {
  name: "",
  enabled: true,
  when: "",
  then: "",
  priority: "medium",
  notes: "",
};

export function RulesEnginePanel() {
  const [items, setItems] = useState<Rule[]>([]);
  const [draft, setDraft] = useState<Rule>(emptyRule);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const { addToast } = useToast();

  const load = () => {
    setLoading(true);
    fetchRules()
      .then((data) => setItems(data))
      .catch((err) => addToast({ title: "Rules laden fehlgeschlagen", description: String(err), variant: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetchConfig()
      .then((data) => setConfig(data))
      .catch(() => setConfig(null));
  }, []);

  const valueMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!config) return map;
    Object.values(config).forEach((category) => {
      const items = ([] as any[]).concat(category?.inputs ?? [], category?.targets ?? []);
      items.forEach((item) => {
        if (!item?.role) return;
        const numeric = Number(String(item.value ?? "").replace(",", "."));
        if (Number.isFinite(numeric)) map[item.role] = numeric;
      });
    });
    return map;
  }, [config, previewTick]);

  const roleIndex = useMemo(() => {
    const index: Record<string, string> = {};
    if (!config) return index;
    Object.entries(config).forEach(([categoryKey, category]) => {
      const inputs = Array.isArray(category?.inputs) ? category.inputs : [];
      inputs.forEach((item) => {
        if (!item?.role) return;
        if (!(item.role in index)) {
          index[item.role] = categoryKey;
        }
      });
    });
    return index;
  }, [config]);

  const resolveMetricValue = (metric: string) => {
    const key = metric.toLowerCase();
    const roleCandidates: Record<string, string[]> = {
      vpd: ["actual_vpd", "vpd_day_min", "vpd_day_max"],
      vwc: ["actual_vwc", "vwc_day_min", "vwc_day_max"],
      ec: ["actual_ecp", "ecp_day_min", "ecp_day_max", "soil_ec"],
      ph: ["ph_target"],
      temp: ["actual_temp", "temp_day_min", "temp_day_max"],
      humidity: ["actual_humidity", "hum_day_min", "hum_day_max"],
      co2: ["actual_co2", "co2_target"],
    };
    const roles = roleCandidates[key] ?? [key];
    for (const role of roles) {
      if (role in valueMap) return valueMap[role];
    }
    return null;
  };

  const parseWhen = (text: string) => {
    const normalized = text.replace(/,/g, ".");
    const match = normalized.match(/([A-Za-z_]+)\s*(>=|<=|>|<|=)\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!match) return null;
    let metric = match[1].toLowerCase();
    if (metric === "rh" || metric === "hum") metric = "humidity";
    if (metric === "temp") metric = "temp";
    const operator = match[2];
    const threshold = Number(match[3]);
    if (!Number.isFinite(threshold)) return null;
    return { metric, operator, threshold };
  };

  const parseThen = (text: string) => {
    const normalized = text.toLowerCase();
    const role = Object.keys(roleIndex).find((candidate) => normalized.includes(candidate.toLowerCase()));
    if (!role) return null;
    const hasToggleOn = /(toggle|turn|schalte)\s+.*(on|an)/.test(normalized);
    const hasToggleOff = /(toggle|turn|schalte)\s+.*(off|aus)/.test(normalized);
    if (hasToggleOn || hasToggleOff) {
      return { role, category: roleIndex[role], value: hasToggleOn };
    }
    const numberMatch = normalized.match(/(-?[0-9]+(?:\.[0-9]+)?)/);
    if (!numberMatch) return null;
    const numeric = Number(numberMatch[1]);
    if (!Number.isFinite(numeric)) return null;
    return { role, category: roleIndex[role], value: numeric };
  };

  const preview = useMemo(() => {
    return items.map((rule) => {
      const parsed = parseWhen(rule.when || "");
      if (!parsed) return { id: rule.id, status: "unknown", value: null };
      const value = resolveMetricValue(parsed.metric);
      if (value == null) return { id: rule.id, status: "unknown", value: null };
      const ok = (() => {
        switch (parsed.operator) {
          case ">":
            return value > parsed.threshold;
          case ">=":
            return value >= parsed.threshold;
          case "<":
            return value < parsed.threshold;
          case "<=":
            return value <= parsed.threshold;
          case "=":
            return Math.abs(value - parsed.threshold) < 0.0001;
          default:
            return false;
        }
      })();
      return { id: rule.id, status: ok ? "match" : "no-match", value };
    });
  }, [items, valueMap]);

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.when.trim() || !draft.then.trim()) {
      addToast({ title: "Bitte alle Felder fuellen", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveRule(draft);
      setDraft(emptyRule);
      load();
      addToast({ title: "Rule gespeichert", variant: "success" });
    } catch (err) {
      addToast({ title: "Rule speichern fehlgeschlagen", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: Rule) => {
    try {
      await saveRule({ ...rule, enabled: !rule.enabled });
      load();
    } catch (err) {
      addToast({ title: "Rule Update fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteRule(id);
      load();
      addToast({ title: "Rule geloescht", variant: "success" });
    } catch (err) {
      addToast({ title: "Rule loeschen fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const handleExecuteMatches = async () => {
    if (!config) {
      addToast({ title: "Config fehlt", description: "Bitte Sensor-Mapping laden.", variant: "error" });
      return;
    }
    const actions = items
      .map((rule, index) => ({ rule, preview: preview[index] }))
      .filter((entry) => entry.preview?.status === "match")
      .map((entry) => ({
        rule: entry.rule,
        action: parseThen(entry.rule.then || ""),
      }));

    if (!actions.length) {
      addToast({ title: "Keine Matches", description: "Keine Regel ist aktiv.", variant: "info" });
      return;
    }

    const results = await Promise.all(
      actions.map(async ({ rule, action }) => {
        if (!action) {
          return { ok: false, rule: rule.name };
        }
        try {
          await updateConfigValue({ category: action.category, role: action.role, value: action.value });
          return { ok: true, rule: rule.name };
        } catch {
          return { ok: false, rule: rule.name };
        }
      })
    );

    const success = results.filter((item) => item.ok).length;
    const failed = results.length - success;
    if (success) {
      addToast({ title: "Regeln ausgefuehrt", description: `${success} ok, ${failed} fehlgeschlagen`, variant: "success" });
    } else {
      addToast({ title: "Ausfuehrung fehlgeschlagen", description: "Keine Regel konnte ausgefuehrt werden.", variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Rules Engine</p>
          <h2 className="gradient-text mt-1 texWenn du willst, passe ich als Nächstes die Beobachtungs‑Texte und Standard‑Prozentwerte an deine gewünschten Richtwerte (z.B. EC‑Trend „steigend“ = -5%).

light">Automationsregeln</h2>
          <p className="mt-2 text-sm text-white/60">Human-readable Regeln fuer Klima, Licht und Bewaesserung.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Neue Regel</p>
          <p className="mt-2 text-xs text-white/50">
            Syntax: WENN &lt;Messwert&gt; &lt;Operator&gt; &lt;Wert&gt;, DANN &lt;Aktion&gt;.
          </p>
          <div className="mt-4 space-y-3">
            <input
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Name"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <input
              value={draft.when}
              onChange={(event) => setDraft((prev) => ({ ...prev, when: event.target.value }))}
              placeholder="WENN z.B. VPD > 1.6 oder RH < 52"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <input
              value={draft.then}
              onChange={(event) => setDraft((prev) => ({ ...prev, then: event.target.value }))}
              placeholder="DANN z.B. Erhoehe Bewaesserung oder Senke Temp"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <select
              value={draft.priority}
              onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            >
              <option value="low" className="bg-[#070a16]">Low</option>
              <option value="medium" className="bg-[#070a16]">Medium</option>
              <option value="high" className="bg-[#070a16]">High</option>
            </select>
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Notizen"
              rows={2}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <button
              className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Rule speichern"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Preview: Dry-run mit aktuellen Werten</span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] text-white/70"
                onClick={() => setPreviewTick((prev) => prev + 1)}
              >
                Preview aktualisieren
              </button>
              <button
                className="rounded-full border border-grow-lime/40 bg-grow-lime/10 px-3 py-1 text-[10px] text-grow-lime"
                onClick={handleExecuteMatches}
              >
                Matches ausfuehren
              </button>
            </div>
          </div>
          {items.map((item, index) => {
            const previewState = preview[index];
            const status = previewState?.status ?? "unknown";
            const statusLabel =
              status === "match" ? "MATCH" : status === "no-match" ? "NO MATCH" : "UNKNOWN";
            return (
              <div key={item.id} className="glass-card rounded-2xl px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">{item.name}</p>
                    <p className="text-xs text-white/50">{item.when} → {item.then}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] ${
                        status === "match"
                          ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                          : status === "no-match"
                          ? "border-white/10 bg-black/40 text-white/70"
                          : "border-brand-orange/40 bg-brand-orange/10 text-brand-orange"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <button
                      className={`rounded-full border px-3 py-1 text-xs ${
                        item.enabled
                          ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                          : "border-white/10 bg-black/40 text-white/70"
                      }`}
                      onClick={() => toggleRule(item)}
                    >
                      {item.enabled ? "Aktiv" : "Inaktiv"}
                    </button>
                    <button
                      className="rounded-full border border-brand-red/40 bg-brand-red/10 px-3 py-1 text-xs text-brand-red"
                      onClick={() => handleDelete(item.id)}
                    >
                      Loeschen
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-sm text-white/60">Keine Rules angelegt.</p>}
        </div>
      </div>
    </section>
  );
}
