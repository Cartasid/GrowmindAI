import { useEffect, useState } from "react";

import { fetchSystemInfo, type SystemInfo } from "../services/configService";

export function GrafanaEmbedPanel() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchSystemInfo()
      .then((data) => {
        if (active) setInfo(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const url = info?.grafana_embed_url?.trim() ?? "";

  return (
    <section className="glass-panel tactical-grid relative overflow-hidden rounded-3xl p-5 shadow-neon sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Grafana</p>
          <h2 className="gradient-text mt-1 text-2xl font-light">Live Dashboards</h2>
          <p className="mt-2 text-sm text-white/60">Eingebettete Zeitreihen und KPIs.</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-xs text-brand-red">
          {error}
        </div>
      )}

      {url ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <iframe
            title="Grafana"
            src={url}
            className="h-[480px] w-full"
            allow="fullscreen"
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-white/60">
          Kein Grafana-Embed konfiguriert. Setze `grafana_embed_url` in den Add-on Optionen.
        </p>
      )}
    </section>
  );
}
