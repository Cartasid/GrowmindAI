import { useEffect, useState } from "react";

import { deleteBatch, fetchBatches, saveBatch, type Batch } from "../services/operationsService";
import { useToast } from "./ToastProvider";

const DEFAULT_AREA_SQFT = 1.2 * 1.2 * 10.7639;

const emptyBatch: Batch = {
  strain: "",
  room: "",
  startDate: "",
  harvestDate: "",
  areaSqFt: Number(DEFAULT_AREA_SQFT.toFixed(2)),
  wetWeight: null,
  dryWeight: null,
  status: "active",
};

const toNumber = (value: string): number | null => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function BatchTrackerPanel() {
  const [items, setItems] = useState<Batch[]>([]);
  const [draft, setDraft] = useState<Batch>(emptyBatch);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = () => {
    setLoading(true);
    fetchBatches()
      .then((data) => setItems(data))
      .catch((err) => addToast({ title: "Batches laden fehlgeschlagen", description: String(err), variant: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!draft.strain.trim()) {
      addToast({ title: "Strain fehlt", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveBatch(draft);
      setDraft(emptyBatch);
      load();
      addToast({ title: "Batch gespeichert", variant: "success" });
    } catch (err) {
      addToast({ title: "Batch speichern fehlgeschlagen", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteBatch(id);
      load();
      addToast({ title: "Batch geloescht", variant: "success" });
    } catch (err) {
      addToast({ title: "Batch loeschen fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const yieldPerSqft = (batch: Batch) => {
    const area = batch.areaSqFt || DEFAULT_AREA_SQFT;
    if (!batch.dryWeight || !area) return null;
    return batch.dryWeight / area;
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Batches</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Ernte & Batch Tracking</h2>
          <p className="mt-2 text-sm text-white/60">Strain, Area, Yield pro sq ft und Status (Default: 1.2m x 1.2m).</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Neuer Batch</p>
          <div className="mt-4 space-y-3">
            <input
              value={draft.strain}
              onChange={(event) => setDraft((prev) => ({ ...prev, strain: event.target.value }))}
              placeholder="Strain"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <input
              value={draft.room ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, room: event.target.value }))}
              placeholder="Room"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={draft.startDate ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
              <input
                type="date"
                value={draft.harvestDate ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, harvestDate: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="number"
                value={draft.areaSqFt ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, areaSqFt: toNumber(event.target.value) }))}
                placeholder="Area sq ft (default 15.5)"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
              <input
                type="number"
                value={draft.wetWeight ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, wetWeight: toNumber(event.target.value) }))}
                placeholder="Wet kg"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
              <input
                type="number"
                value={draft.dryWeight ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, dryWeight: toNumber(event.target.value) }))}
                placeholder="Dry kg"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              />
            </div>
            <button
              className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Batch speichern"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const yieldValue = yieldPerSqft(item);
            return (
              <div key={item.id} className="glass-card rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">{item.strain}</p>
                    <p className="text-xs text-white/50">{item.room || "Room"} · {item.status}</p>
                    {yieldValue != null && (
                      <p className="text-[11px] text-white/60">Yield: {yieldValue.toFixed(2)} kg/sqft</p>
                    )}
                  </div>
                  <button
                    className="rounded-full border border-brand-red/40 bg-brand-red/10 px-3 py-1 text-xs text-brand-red"
                    onClick={() => handleDelete(item.id)}
                  >
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <p className="text-sm text-white/60">Keine Batches vorhanden.</p>}
        </div>
      </div>
    </section>
  );
}
