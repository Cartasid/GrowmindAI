import { useEffect, useMemo, useState } from "react";
import type { Cultivar, Substrate } from "../types";
import {
  addGrow,
  deleteGrow,
  getActiveGrowId,
  getGrows,
  setActiveGrowId,
  updateGrow,
  type Grow,
} from "../services/growService";
import { loadJournal } from "../services/journalService";
import { useToast } from "./ToastProvider";

const CULTIVARS: { value: Cultivar; label: string }[] = [
  { value: "wedding_cake", label: "Wedding Cake" },
  { value: "blue_dream", label: "Blue Dream" },
  { value: "amnesia_haze", label: "Amnesia Haze" },
];

const SUBSTRATES: { value: Substrate; label: string }[] = [
  { value: "coco", label: "Coco" },
  { value: "soil", label: "Erde" },
  { value: "rockwool", label: "Steinwolle" },
];

export function GrowManagerPanel({
  activeGrowId,
  onSelect,
}: {
  activeGrowId: string;
  onSelect: (growId: string) => void;
}) {
  const [grows, setGrows] = useState<Grow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newGrow, setNewGrow] = useState<Omit<Grow, "id">>({
    name: "",
    cultivar: "wedding_cake",
    substrate: "coco",
    startDate: new Date().toISOString().slice(0, 10),
    status: "active",
  });
  const [compare, setCompare] = useState<string[]>([]);
  const { addToast } = useToast();

  useEffect(() => {
    const data = getGrows();
    setGrows(data);
    const stored = getActiveGrowId();
    if (stored) {
      onSelect(stored);
    }
  }, [onSelect]);

  const activeGrow = useMemo(() => grows.find((grow) => grow.id === activeGrowId), [grows, activeGrowId]);

  const computeAverage = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const computeTrend = (values: number[]) => {
    if (values.length < 4) return "flat";
    const recent = computeAverage(values.slice(-3));
    const previous = computeAverage(values.slice(-6, -3));
    if (recent == null || previous == null) return "flat";
    const diff = recent - previous;
    if (Math.abs(diff) < 0.01) return "flat";
    return diff > 0 ? "up" : "down";
  };

  const buildStats = (growId: string) => {
    const entries = loadJournal(growId) || [];
    const sorted = entries.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const metrics = {
      vpd: sorted.map((entry) => entry.metrics?.vpd).filter((v): v is number => typeof v === "number"),
      vwc: sorted.map((entry) => entry.metrics?.vwc).filter((v): v is number => typeof v === "number"),
      ec: sorted.map((entry) => entry.metrics?.ec).filter((v): v is number => typeof v === "number"),
    };
    return {
      count: entries.length,
      lastDate: sorted.length ? new Date(sorted[sorted.length - 1].date).toLocaleDateString("de-DE") : "—",
      averages: {
        vpd: computeAverage(metrics.vpd),
        vwc: computeAverage(metrics.vwc),
        ec: computeAverage(metrics.ec),
      },
      trends: {
        vpd: computeTrend(metrics.vpd),
        vwc: computeTrend(metrics.vwc),
        ec: computeTrend(metrics.ec),
      },
      series: metrics,
    };
  };

  const buildSparkline = (values: number[], width = 80, height = 26) => {
    if (!values.length) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .slice(-12)
      .map((value, index, arr) => {
        const x = (index / Math.max(arr.length - 1, 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  };

  const handleCreate = () => {
    if (!newGrow.name.trim()) {
      addToast({ title: "Name fehlt", description: "Bitte einen Grow-Namen vergeben.", variant: "error" });
      return;
    }
    const created = addGrow(newGrow);
    setGrows((prev) => [...prev, created]);
    setCreating(false);
    setNewGrow({
      name: "",
      cultivar: "wedding_cake",
      substrate: "coco",
      startDate: new Date().toISOString().slice(0, 10),
      status: "active",
    });
    setActiveGrowId(created.id);
    onSelect(created.id);
    addToast({ title: "Grow erstellt", variant: "success" });
  };

  const handleDelete = (growId: string) => {
    if (grows.length <= 1) return;
    const confirmMessage = `Grow "${growId}" wirklich loeschen?`;
    if (!window.confirm(confirmMessage)) return;
    const next = deleteGrow(growId);
    setGrows(next);
    if (growId === activeGrowId) {
      const nextId = next[0]?.id ?? "default";
      setActiveGrowId(nextId);
      onSelect(nextId);
    }
    addToast({ title: "Grow geloescht", variant: "success" });
  };

  const handleUpdate = (grow: Grow) => {
    const next = updateGrow(grow);
    setGrows(next);
    addToast({ title: "Grow aktualisiert", variant: "success" });
  };

  const toggleCompare = (growId: string) => {
    setCompare((prev) =>
      prev.includes(growId) ? prev.filter((id) => id !== growId) : [...prev, growId]
    );
  };

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Grows</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Grow Manager</h2>
          <p className="mt-2 text-sm text-white/60">Mehrere Runs verwalten und vergleichen.</p>
        </div>
        <button
          className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-4 py-2 text-xs text-brand-cyan shadow-brand-glow"
          onClick={() => setCreating((prev) => !prev)}
        >
          {creating ? "Abbrechen" : "Neuer Grow"}
        </button>
      </div>

      {creating && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-white/70">
              Name
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white"
                value={newGrow.name}
                onChange={(event) => setNewGrow((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="text-sm text-white/70">
              Startdatum
              <input
                type="date"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white"
                value={newGrow.startDate}
                onChange={(event) => setNewGrow((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </label>
            <label className="text-sm text-white/70">
              Cultivar
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white"
                value={newGrow.cultivar}
                onChange={(event) => setNewGrow((prev) => ({ ...prev, cultivar: event.target.value as Cultivar }))}
              >
                {CULTIVARS.map((cultivar) => (
                  <option key={cultivar.value} value={cultivar.value} className="bg-[#070a16]">
                    {cultivar.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-white/70">
              Substrat
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-white"
                value={newGrow.substrate}
                onChange={(event) => setNewGrow((prev) => ({ ...prev, substrate: event.target.value as Substrate }))}
              >
                {SUBSTRATES.map((substrate) => (
                  <option key={substrate.value} value={substrate.value} className="bg-[#070a16]">
                    {substrate.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="mt-4 w-full rounded-full border border-grow-lime/40 bg-grow-lime/10 px-4 py-2 text-sm text-grow-lime"
            onClick={handleCreate}
          >
            Grow speichern
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-4">
        {grows.map((grow) => (
          <div
            key={grow.id}
            className={`glass-card rounded-2xl px-4 py-4 ${
              grow.id === activeGrowId ? "border border-brand-cyan/40" : ""
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg text-white">{grow.name}</p>
                <p className="text-xs text-white/50">
                  {grow.cultivar} · {grow.substrate} · {grow.startDate}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-xs text-brand-cyan"
                  onClick={() => {
                    setActiveGrowId(grow.id);
                    onSelect(grow.id);
                  }}
                >
                  Aktivieren
                </button>
                <button
                  className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/70"
                  onClick={() => toggleCompare(grow.id)}
                >
                  {compare.includes(grow.id) ? "Vergleich entfernen" : "Vergleichen"}
                </button>
                {grows.length > 1 && (
                  <button
                    className="rounded-full border border-brand-red/40 px-3 py-1 text-xs text-brand-red"
                    onClick={() => handleDelete(grow.id)}
                  >
                    Loeschen
                  </button>
                )}
              </div>
            </div>
            {grow.id === activeGrowId && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-white/60">
                  Status
                  <select
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                    value={grow.status}
                    onChange={(event) => handleUpdate({ ...grow, status: event.target.value as Grow["status"] })}
                  >
                    <option value="active" className="bg-[#070a16]">Aktiv</option>
                    <option value="archived" className="bg-[#070a16]">Archiv</option>
                  </select>
                </label>
                <label className="text-xs text-white/60">
                  Name
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                    value={grow.name}
                    onChange={(event) => handleUpdate({ ...grow, name: event.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {compare.length > 1 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="meta-mono text-[11px] text-white/50">Vergleich</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {grows
              .filter((grow) => compare.includes(grow.id))
              .map((grow) => (
                <div key={grow.id} className="glass-card rounded-2xl px-4 py-3">
                  <p className="text-sm text-white">{grow.name}</p>
                  <p className="text-xs text-white/50">
                    {grow.cultivar} · {grow.substrate}
                  </p>
                  {(() => {
                    const stats = buildStats(grow.id);
                    const vpdPath = buildSparkline(stats.series.vpd);
                    const vwcPath = buildSparkline(stats.series.vwc);
                    const ecPath = buildSparkline(stats.series.ec);
                    return (
                      <div className="mt-3 space-y-2 text-xs text-white/60">
                        <div>Entries: {stats.count}</div>
                        <div>Last: {stats.lastDate}</div>
                        <div className="flex flex-wrap gap-2">
                          <span>
                            VPD {stats.averages.vpd != null ? stats.averages.vpd.toFixed(2) : "—"}
                            {stats.trends.vpd === "up" ? " ^" : stats.trends.vpd === "down" ? " v" : " ->"}
                          </span>
                          <span>
                            VWC {stats.averages.vwc != null ? stats.averages.vwc.toFixed(1) : "—"}
                            {stats.trends.vwc === "up" ? " ^" : stats.trends.vwc === "down" ? " v" : " ->"}
                          </span>
                          <span>
                            EC {stats.averages.ec != null ? stats.averages.ec.toFixed(2) : "—"}
                            {stats.trends.ec === "up" ? " ^" : stats.trends.ec === "down" ? " v" : " ->"}
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="rounded-xl border border-white/10 bg-black/30 px-2 py-1">
                            <p className="text-[10px] text-white/40">VPD</p>
                            <svg viewBox="0 0 80 26" className="h-6 w-full">
                              <path d={vpdPath} fill="none" stroke="#6C5BFF" strokeWidth="2" />
                            </svg>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/30 px-2 py-1">
                            <p className="text-[10px] text-white/40">VWC</p>
                            <svg viewBox="0 0 80 26" className="h-6 w-full">
                              <path d={vwcPath} fill="none" stroke="#2FE6FF" strokeWidth="2" />
                            </svg>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/30 px-2 py-1">
                            <p className="text-[10px] text-white/40">EC</p>
                            <svg viewBox="0 0 80 26" className="h-6 w-full">
                              <path d={ecPath} fill="none" stroke="#FF8A3D" strokeWidth="2" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
          </div>
        </div>
      )}

      {activeGrow && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
          Aktiver Grow: {activeGrow.name}
        </div>
      )}
    </section>
  );
}
