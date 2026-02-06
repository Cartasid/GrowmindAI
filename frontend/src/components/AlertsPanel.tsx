import { useEffect, useState } from "react";

import { deleteAlert, fetchAlerts, saveAlert, type AlertConfig } from "../services/operationsService";
import { useToast } from "./ToastProvider";

const emptyAlert: AlertConfig = {
  name: "",
  metric: "vpd",
  operator: ">",
  threshold: 1,
  severity: "warning",
  enabled: true,
};

export function AlertsPanel() {
  const [items, setItems] = useState<AlertConfig[]>([]);
  const [draft, setDraft] = useState<AlertConfig>(emptyAlert);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = () => {
    setLoading(true);
    fetchAlerts()
      .then((data) => setItems(data))
      .catch((err) => addToast({ title: "Alerts laden fehlgeschlagen", description: String(err), variant: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!draft.name.trim()) {
      addToast({ title: "Name fehlt", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveAlert(draft);
      setDraft(emptyAlert);
      load();
      addToast({ title: "Alert gespeichert", variant: "success" });
    } catch (err) {
      addToast({ title: "Alert speichern fehlgeschlagen", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleAlert = async (alert: AlertConfig) => {
    try {
      await saveAlert({ ...alert, enabled: !alert.enabled });
      load();
    } catch (err) {
      addToast({ title: "Alert Update fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteAlert(id);
      load();
      addToast({ title: "Alert geloescht", variant: "success" });
    } catch (err) {
      addToast({ title: "Alert loeschen fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Alerts</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Smart Alerts</h2>
          <p className="mt-2 text-sm text-white/60">Schwellenwerte fuer proaktive Warnungen.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Neuer Alert</p>
          <div className="mt-4 space-y-3">
            <input
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Name"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={draft.metric}
                onChange={(event) => setDraft((prev) => ({ ...prev, metric: event.target.value }))}
                placeholder="Metric"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
              <select
                value={draft.operator}
                onChange={(event) => setDraft((prev) => ({ ...prev, operator: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              >
                <option value=">" className="bg-[#070a16]">&gt;</option>
                <option value="<" className="bg-[#070a16]">&lt;</option>
                <option value=">=" className="bg-[#070a16]">&gt;=</option>
                <option value="<=" className="bg-[#070a16]">&lt;=</option>
              </select>
              <input
                type="number"
                value={draft.threshold}
                onChange={(event) => setDraft((prev) => ({ ...prev, threshold: Number(event.target.value) }))}
                placeholder="Threshold"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
            </div>
            <select
              value={draft.severity}
              onChange={(event) => setDraft((prev) => ({ ...prev, severity: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            >
              <option value="info" className="bg-[#070a16]">Info</option>
              <option value="warning" className="bg-[#070a16]">Warning</option>
              <option value="critical" className="bg-[#070a16]">Critical</option>
            </select>
            <button
              className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Alert speichern"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{item.name}</p>
                  <p className="text-xs text-white/50">{item.metric} {item.operator} {item.threshold}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`rounded-full border px-3 py-1 text-xs ${
                      item.enabled
                        ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                        : "border-white/10 bg-black/40 text-white/70"
                    }`}
                    onClick={() => toggleAlert(item)}
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
          {items.length === 0 && <p className="text-sm text-white/60">Keine Alerts definiert.</p>}
        </div>
      </div>
    </section>
  );
}
