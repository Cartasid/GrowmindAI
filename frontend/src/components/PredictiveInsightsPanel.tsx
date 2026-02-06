import { useEffect, useState } from "react";

import { fetchPredict, type PredictResponse } from "../services/operationsService";
import { useToast } from "./ToastProvider";

export function PredictiveInsightsPanel({ growId }: { growId: string }) {
  const [data, setData] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPredict(growId)
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((err) => addToast({ title: "Predict laden fehlgeschlagen", description: String(err), variant: "error" }))
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [growId, addToast]);

  const riskColor =
    data?.risk_level === "high" ? "text-brand-red" : data?.risk_level === "medium" ? "text-brand-orange" : "text-grow-lime";

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Predict</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Predictive Insights</h2>
          <p className="mt-2 text-sm text-white/60">Frueherkennung, Risiko und Yield-Prognose.</p>
        </div>
        <span className="brand-chip normal-case text-[10px]">{loading ? "Laedt" : "Bereit"}</span>
      </div>

      {data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="glass-card rounded-2xl px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Risk Level</p>
            <p className={`mt-2 text-2xl ${riskColor}`}>{data.risk_level.toUpperCase()}</p>
            <p className="mt-2 text-xs text-white/60">Datenpunkte: {data.data_points}</p>
            {data.yield_forecast && (
              <div className="mt-3 text-xs text-white/70">
                <p>Avg Dry: {data.yield_forecast.avg_dry_weight.toFixed(2)} kg</p>
                <p>Best Dry: {data.yield_forecast.best_dry_weight.toFixed(2)} kg</p>
                <p>Samples: {data.yield_forecast.samples}</p>
              </div>
            )}
          </div>

          <div className="glass-card rounded-2xl px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Alerts & Empfehlungen</p>
            <div className="mt-3 space-y-2 text-xs text-white/70">
              {data.flags.length === 0 && <p>Keine Anomalien erkannt.</p>}
              {data.flags.map((flag) => (
                <div key={flag.metric} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                  <p className="text-sm text-white">{flag.metric.toUpperCase()}</p>
                  <p className="text-[11px] text-white/60">
                    Wert {flag.value.toFixed(2)} · Z {flag.zscore.toFixed(2)}
                  </p>
                </div>
              ))}
              {data.recommendations.map((rec, idx) => (
                <p key={`${rec}-${idx}`}>• {rec}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
