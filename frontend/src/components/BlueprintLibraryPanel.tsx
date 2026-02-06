import { useEffect, useState } from "react";

import { deleteBlueprint, fetchBlueprints, saveBlueprint, type Blueprint } from "../services/operationsService";
import { useToast } from "./ToastProvider";

const emptyBlueprint: Blueprint = {
  name: "",
  description: "",
  tags: [],
  stages: [],
};

export function BlueprintLibraryPanel() {
  const [items, setItems] = useState<Blueprint[]>([]);
  const [draft, setDraft] = useState<Blueprint>(emptyBlueprint);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = () => {
    setLoading(true);
    fetchBlueprints()
      .then((data) => setItems(data))
      .catch((err) => addToast({ title: "Blueprints laden fehlgeschlagen", description: String(err), variant: "error" }))
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
      const payload: Blueprint = {
        ...draft,
        tags: (draft.tags || []).filter(Boolean),
      };
      await saveBlueprint(payload);
      setDraft(emptyBlueprint);
      load();
      addToast({ title: "Blueprint gespeichert", variant: "success" });
    } catch (err) {
      addToast({ title: "Blueprint speichern fehlgeschlagen", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteBlueprint(id);
      load();
      addToast({ title: "Blueprint geloescht", variant: "success" });
    } catch (err) {
      addToast({ title: "Blueprint loeschen fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Blueprints</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Grow Vorlagen</h2>
          <p className="mt-2 text-sm text-white/60">Standardisierte Rezepte fuer wiederholbare Runs.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Neuer Blueprint</p>
          <div className="mt-4 space-y-3">
            <input
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Name"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Beschreibung"
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <input
              value={(draft.tags || []).join(", ")}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="Tags (comma separated)"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <button
              className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Blueprint speichern"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{item.name}</p>
                  <p className="text-xs text-white/50">{item.description || "Keine Beschreibung"}</p>
                </div>
                <button
                  className="rounded-full border border-brand-red/40 bg-brand-red/10 px-3 py-1 text-xs text-brand-red"
                  onClick={() => handleDelete(item.id)}
                >
                  Loeschen
                </button>
              </div>
              {item.tags && item.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/60">
                  {item.tags.map((tag) => (
                    <span key={`${item.id}-${tag}`} className="rounded-full border border-white/10 px-2 py-1">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-white/60">Keine Blueprints gespeichert.</p>}
        </div>
      </div>
    </section>
  );
}
