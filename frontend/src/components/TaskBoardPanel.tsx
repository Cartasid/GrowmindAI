import { useEffect, useState } from "react";

import { deleteTask, fetchTasks, saveTask, type Task } from "../services/operationsService";
import { useToast } from "./ToastProvider";

const emptyTask: Task = {
  title: "",
  description: "",
  status: "open",
  priority: "medium",
  dueDate: "",
  tags: [],
};

export function TaskBoardPanel() {
  const [items, setItems] = useState<Task[]>([]);
  const [draft, setDraft] = useState<Task>(emptyTask);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = () => {
    setLoading(true);
    fetchTasks()
      .then((data) => setItems(data))
      .catch((err) => addToast({ title: "Tasks laden fehlgeschlagen", description: String(err), variant: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!draft.title.trim()) {
      addToast({ title: "Titel fehlt", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveTask(draft);
      setDraft(emptyTask);
      load();
      addToast({ title: "Task gespeichert", variant: "success" });
    } catch (err) {
      addToast({ title: "Task speichern fehlgeschlagen", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (task: Task) => {
    const nextStatus = task.status === "done" ? "open" : "done";
    try {
      await saveTask({ ...task, status: nextStatus });
      load();
    } catch (err) {
      addToast({ title: "Task Update fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteTask(id);
      load();
      addToast({ title: "Task geloescht", variant: "success" });
    } catch (err) {
      addToast({ title: "Task loeschen fehlgeschlagen", description: String(err), variant: "error" });
    }
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Tasks</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Task Board</h2>
          <p className="mt-2 text-sm text-white/60">Workflow und IPM-Tasks fuer den Grow.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Neuer Task</p>
          <div className="mt-4 space-y-3">
            <input
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Titel"
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Beschreibung"
              rows={2}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
            />
            <input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
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
            <button
              className="w-full rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Speichert..." : "Task speichern"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{item.title}</p>
                  <p className="text-xs text-white/50">{item.description || "Keine Beschreibung"}</p>
                  {item.dueDate && <p className="text-[11px] text-white/40">Due: {item.dueDate}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`rounded-full border px-3 py-1 text-xs ${
                      item.status === "done"
                        ? "border-grow-lime/40 bg-grow-lime/10 text-grow-lime"
                        : "border-white/10 bg-black/40 text-white/70"
                    }`}
                    onClick={() => toggleDone(item)}
                  >
                    {item.status === "done" ? "Done" : "Open"}
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
          {items.length === 0 && <p className="text-sm text-white/60">Keine Tasks vorhanden.</p>}
        </div>
      </div>
    </section>
  );
}
