import { useEffect, useState } from "react";

import { deleteRule, fetchRules, saveRule, type Rule } from "../services/operationsService";
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
  }, []);

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

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Rules Engine</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Automationsregeln</h2>
          <p className="mt-2 text-sm text-white/60">IF/THEN Logik fuer Klima, Licht und Bewaesserung.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Neue Regel</p>
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
              placeholder="WHEN (z.B. VPD > 1.6)"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <input
              value={draft.then}
              onChange={(event) => setDraft((prev) => ({ ...prev, then: event.target.value }))}
              placeholder="THEN (z.B. Erhoehe Bewaesserung)"
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
          {items.map((item) => (
            <div key={item.id} className="glass-card rounded-2xl px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{item.name}</p>
                  <p className="text-xs text-white/50">{item.when} → {item.then}</p>
                </div>
                <div className="flex items-center gap-2">
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
          ))}
          {items.length === 0 && <p className="text-sm text-white/60">Keine Rules angelegt.</p>}
        </div>
      </div>
    </section>
  );
}
