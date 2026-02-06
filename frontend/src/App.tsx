import {
  Activity,
  Droplets,
  Leaf,
  Thermometer,
  Waves,
  Wind,
  type LucideIcon
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { apiUrl } from "./api";
import { GlassCard } from "./components/GlassCard";
import { NutrientCalculator } from "./components/NutrientCalculator";
import { SpectrumAnalyzer } from "./components/SpectrumAnalyzer";
import { SensorMappingPanel } from "./components/SensorMappingPanel";
import Journal from "./Journal";
import { useSensorStatus } from "./hooks/useSensorStatus";
import logo from "./assets/growmind-logo.svg";

type Metric = {
  label: string;
  value: string;
  delta?: string;
  secondary?: string;
  icon: LucideIcon;
};

type SectionKey = "overview" | "journal" | "nutrients";

const climateMetrics: Metric[] = [
  {
    label: "Temperatur",
    value: "24.6°C",
    delta: "+0.4°C",
    secondary: "Soll 24.0°C",
    icon: Thermometer
  },
  {
    label: "Luftfeuchte",
    value: "62%",
    delta: "-1%",
    secondary: "Soll 60%",
    icon: Droplets
  },
  {
    label: "Luftfluss",
    value: "1.8 m/s",
    delta: "+0.2",
    secondary: "Zuluft aktiv",
    icon: Wind
  }
];

const substrateMetrics: Metric[] = [
  {
    label: "EC-Wert",
    value: "2.1 mS/cm",
    secondary: "Optimales Niveau",
    icon: Activity
  },
  {
    label: "Feuchtegehalt",
    value: "54%",
    delta: "+2%",
    secondary: "Bewässerung in 45 Min",
    icon: Waves
  },
  {
    label: "Nährstofffluss",
    value: "0.9 L/min",
    secondary: "Kanal B",
    icon: Leaf
  }
];

const sidebarLinks: { key: SectionKey; label: string }[] = [
  { key: "overview", label: "Übersicht" },
  { key: "journal", label: "Journal" },
  { key: "nutrients", label: "Nährstoffrechner" }
];

const sectionMeta: Record<SectionKey, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: "Dashboard",
    title: "GrowMind Control Suite",
    subtitle: "Live-Übersicht der Sensorik und Automationen"
  },
  journal: {
    eyebrow: "Grow Log",
    title: "Journal",
    subtitle: "Dokumentation, Fotos und AI-Notes für jeden Run"
  },
  nutrients: {
    eyebrow: "Feed Lab",
    title: "Nährstoffrechner",
    subtitle: "PhotonFlux-Doser mit Plan- und Wasserprofilen"
  }
};

const pageVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" }
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.3, ease: "easeIn" } }
};

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

function GradientCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  return (
    <GlassCard
      title={metric.label}
      subtitle={metric.secondary}
      icon={<Icon className="icon-base icon-lg" />}
      rightSlot={
        metric.delta ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan shadow-brand-glow" />
            {metric.delta}
          </span>
        ) : null
      }
    >
      <p className="text-4xl font-light text-white">{metric.value}</p>
    </GlassCard>
  );
}

function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [telemetrySaving, setTelemetrySaving] = useState(false);

  const activeMeta = sectionMeta[activeSection];

  const alarmRoles = ["leak_detected", "pump_dry", "sensor_fault"];

  const vpd = useSensorStatus({
    actualRole: "actual_vpd",
    minRole: "vpd_day_min",
    maxRole: "vpd_day_max",
    alarmRoles,
    warnRatio: 0.1,
    pollSeconds: 5,
  });

  const vwc = useSensorStatus({
    actualRole: "actual_vwc",
    minRole: "vwc_day_min",
    maxRole: "vwc_day_max",
    alarmRoles,
    warnRatio: 0.1,
    pollSeconds: 5,
  });

  const ecp = useSensorStatus({
    actualRole: "actual_ecp",
    minRole: "ecp_day_min",
    maxRole: "ecp_day_max",
    alarmRoles,
    warnRatio: 0.1,
    pollSeconds: 5,
  });

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const response = await fetch(apiUrl("/api/telemetry/settings"));
        if (!response.ok) {
          throw new Error(`Failed to read telemetry settings (${response.status})`);
        }
        const data = await response.json();
        if (!cancelled) {
          setTelemetryEnabled(Boolean(data?.settings?.enabled));
        }
      } catch (error) {
        console.error("Telemetry opt-in fetch failed", error);
      } finally {
        if (!cancelled) {
          setTelemetryLoading(false);
        }
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTelemetryToggle = async () => {
    if (telemetryLoading || telemetrySaving) {
      return;
    }
    const nextValue = !telemetryEnabled;
    setTelemetryEnabled(nextValue);
    setTelemetrySaving(true);
    try {
      const response = await fetch(apiUrl("/api/telemetry/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextValue })
      });
      if (!response.ok) {
        throw new Error(`Failed to update telemetry settings (${response.status})`);
      }
    } catch (error) {
      console.error("Telemetry opt-in update failed", error);
      setTelemetryEnabled(!nextValue);
    } finally {
      setTelemetrySaving(false);
    }
  };

  return (
    <div className="font-grotesk relative min-h-screen overflow-hidden bg-brand-dark text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-mask bg-[length:140px_140px] opacity-35" />
      <div className="pointer-events-none absolute inset-0 bg-grow-gradient blur-3xl opacity-70" />
      <div className="pointer-events-none absolute -top-32 right-[-10%] h-[360px] w-[360px] rounded-full bg-brand-gradient opacity-40 blur-3xl" />
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute right-[-40px] top-[120px] w-[280px] opacity-[0.07]"
      />
      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="glass-panel relative flex flex-col border-b border-white/10 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-brand-gradient opacity-70" />
          <div className="flex items-center gap-4 border-b border-white/10 px-5 py-5 sm:px-6 lg:px-8">
            <img
              src={logo}
              alt="GrowMind Logo"
              className="h-10 w-auto drop-shadow-[0_0_18px_rgba(47,230,255,0.35)]"
            />
            <div>
              <p className="meta-mono text-[10px] text-white/40">Cultivation OS</p>
              <p className="gradient-text text-lg font-semibold tracking-wide">GrowMind AI</p>
            </div>
          </div>
          <nav className="flex-1 flex gap-2 overflow-x-auto px-4 py-4 lg:flex-col lg:overflow-visible lg:space-y-2 lg:py-6">
            {sidebarLinks.map((link) => {
              const isActive = link.key === activeSection;
              return (
                <button
                  key={link.key}
                  onClick={() => setActiveSection(link.key)}
                  className={`group flex w-auto min-w-[160px] items-center justify-between rounded-2xl border px-4 py-3 text-left text-base transition lg:w-full lg:min-w-0 ${
                    isActive
                      ? "border-brand-cyan/40 bg-gradient-to-r from-brand-cyan/15 via-brand-blue/10 to-brand-purple/20 text-white shadow-brand-glow"
                      : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/5"
                  }`}
                  aria-pressed={isActive}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isActive ? "bg-brand-cyan shadow-brand-glow" : "bg-white/20"
                      }`}
                    />
                    {link.label}
                  </span>
                  {isActive && (
                    <span className="text-[10px] uppercase tracking-[0.3em] text-brand-cyan">LIVE</span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="px-6 pb-6">
            <div className="glass-card rounded-2xl px-4 py-4 text-sm text-white/70">
              <p className="meta-mono text-[10px] text-white/40">AI CORE</p>
              <p className="mt-2 text-white">PhotonFlux x GrowMind</p>
              <p className="mt-1 text-xs text-white/50">Adaptive Klima- & Nährstoffintelligenz</p>
            </div>
          </div>
        </aside>

        <div className="flex flex-col">
          <header className="flex flex-col gap-4 border-b border-white/5 px-4 py-6 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-4 lg:px-10 lg:h-24">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/50">{activeMeta.eyebrow}</p>
              <h1 className="gradient-text text-2xl font-light">{activeMeta.title}</h1>
              <p className="text-sm text-white/60">{activeMeta.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="brand-chip normal-case text-[10px]">
                <span className="h-2 w-2 rounded-full bg-brand-cyan shadow-brand-glow animate-glow" />
                Signal stabil · FastAPI ↔︎ Home Assistant
              </div>
              <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-2 text-sm">
                <div className="flex flex-col leading-tight text-white/70">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">KI-Verbesserung</span>
                  <span className="text-xs text-white">
                    {telemetryLoading ? "lädt..." : telemetryEnabled ? "Anonym aktiv" : "Deaktiviert"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleTelemetryToggle}
                  disabled={telemetryLoading || telemetrySaving}
                  className={`relative flex h-7 w-12 items-center rounded-full border border-white/10 transition focus:outline-none focus:ring-2 focus:ring-grow-cyan/60 ${
                    telemetryEnabled ? "bg-grow-cyan/40" : "bg-white/10"
                  } ${telemetryLoading || telemetrySaving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
                      telemetryEnabled ? "translate-x-5 bg-grow-cyan shadow-neon" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </header>

          <motion.main className="tactical-grid flex-1 space-y-10 bg-brand-ink/40 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                variants={pageVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-10"
              >
                {activeSection === "overview" && (
                  <motion.div variants={staggerContainer} className="space-y-10">
                    <motion.section variants={fadeUp}>
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h2 className="gradient-text text-xl font-semibold">Klima</h2>
                          <p className="text-sm text-white/60">Tesla-dark climate loop · optimiert für VPD 1.2</p>
                        </div>
                        <button className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/70 transition hover:border-grow-cyan/60 hover:text-grow-cyan">
                          Regelkurve
                        </button>
                      </div>
                      <div className="glass-panel mt-6 rounded-3xl p-6">
                        <motion.div variants={staggerContainer} className="grid gap-6 md:grid-cols-3">
                          <motion.div variants={fadeUp}>
                            <GlassCard
                              title="VPD"
                              subtitle="Leaf VPD"
                              icon={<Thermometer className="icon-base icon-lg" />}
                              status={vpd.status}
                              value={vpd.value}
                              min={vpd.min}
                              max={vpd.max}
                              rightSlot={
                                <span className="meta-mono text-[11px] text-white/60">
                                  {vpd.min != null && vpd.max != null
                                    ? `${vpd.min.toFixed(2)}–${vpd.max.toFixed(2)} kPa`
                                    : "—"}
                                </span>
                              }
                            >
                              <p className="text-4xl font-light text-white">
                                {vpd.value != null ? `${vpd.value.toFixed(2)} kPa` : "—"}
                              </p>
                            </GlassCard>
                          </motion.div>
                          {climateMetrics.slice(1).map((metric) => (
                            <motion.div key={metric.label} variants={fadeUp}>
                              <GradientCard metric={metric} />
                            </motion.div>
                          ))}
                        </motion.div>
                      </div>
                    </motion.section>

                    <motion.section variants={fadeUp}>
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h2 className="gradient-text text-xl font-semibold">Substrat</h2>
                          <p className="text-sm text-white/60">Deep root analytics · GrowMind signature mix</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/60 hover:border-grow-violet/70 hover:text-grow-violet">
                            Sensor-Map
                          </button>
                          <button className="rounded-full border border-grow-cyan/30 bg-grow-cyan/10 px-5 py-2 text-sm text-grow-cyan shadow-neon hover:bg-grow-cyan/20">
                            Optimierung
                          </button>
                        </div>
                      </div>
                      <div className="glass-panel mt-6 rounded-3xl p-6">
                        <motion.div variants={staggerContainer} className="grid gap-6 md:grid-cols-3">
                          <motion.div variants={fadeUp}>
                            <GlassCard
                              title="VWC"
                              subtitle="Substrate moisture"
                              icon={<Waves className="icon-base icon-lg" />}
                              status={vwc.status}
                              value={vwc.value}
                              min={vwc.min}
                              max={vwc.max}
                              rightSlot={
                                <span className="meta-mono text-[11px] text-white/60">
                                  {vwc.min != null && vwc.max != null
                                    ? `${vwc.min.toFixed(1)}–${vwc.max.toFixed(1)} %`
                                    : "—"}
                                </span>
                              }
                            >
                              <p className="text-4xl font-light text-white">
                                {vwc.value != null ? `${vwc.value.toFixed(1)} %` : "—"}
                              </p>
                            </GlassCard>
                          </motion.div>

                          <motion.div variants={fadeUp}>
                            <GlassCard
                              title="ECp"
                              subtitle="Pore water EC"
                              icon={<Activity className="icon-base icon-lg" />}
                              status={ecp.status}
                              value={ecp.value}
                              min={ecp.min}
                              max={ecp.max}
                              rightSlot={
                                <span className="meta-mono text-[11px] text-white/60">
                                  {ecp.min != null && ecp.max != null
                                    ? `${ecp.min.toFixed(2)}–${ecp.max.toFixed(2)} mS/cm`
                                    : "—"}
                                </span>
                              }
                            >
                              <p className="text-4xl font-light text-white">
                                {ecp.value != null ? `${ecp.value.toFixed(2)} mS/cm` : "—"}
                              </p>
                            </GlassCard>
                          </motion.div>

                          <motion.div variants={fadeUp}>
                            <GradientCard metric={substrateMetrics[0]} />
                          </motion.div>
                        </motion.div>
                      </div>
                    </motion.section>

                    <motion.div variants={fadeUp}>
                      <SpectrumAnalyzer />
                    </motion.div>

                    <motion.div variants={fadeUp}>
                      <SensorMappingPanel />
                    </motion.div>
                  </motion.div>
                )}
                {activeSection === "journal" && (
                  <motion.div variants={fadeUp}>
                    <Journal growId="default" lang="de" phase="Vegetative" />
                  </motion.div>
                )}
                {activeSection === "nutrients" && (
                  <motion.div variants={fadeUp}>
                    <NutrientCalculator />
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.main>
        </div>
      </div>
    </div>
  );
}

export default App;
