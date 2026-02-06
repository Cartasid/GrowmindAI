import React, { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });

    // Send to error tracking service (e.g., Sentry) in production
    // if (process.env.NODE_ENV === 'production') {
    //   Sentry.captureException(error, { contexts: { react: errorInfo } });
    // }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-dark px-6 py-10 text-white">
          <div className="pointer-events-none absolute inset-0 bg-grid-mask bg-[length:140px_140px] opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-grow-gradient blur-3xl opacity-70" />
          <div className="glass-panel relative w-full max-w-2xl rounded-3xl p-8 text-center shadow-neon">
            <p className="meta-mono text-[10px] text-white/50">SYSTEM RECOVERY</p>
            <h1 className="gradient-text mt-3 text-3xl font-light">Unerwarteter Fehler</h1>
            <p className="mt-3 text-sm text-white/70">
              Es gab ein Problem beim Laden der Ansicht. Bitte lade die Seite neu oder gehe einen Schritt zurueck.
            </p>

            {this.state.error && (
              <div className="mt-5 rounded-2xl border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-left text-xs text-brand-red">
                <p className="meta-mono text-[10px] text-brand-red/80">ERROR</p>
                <p className="mt-2 break-all font-mono text-[11px] text-brand-red">
                  {this.state.error.message || "An unexpected error occurred"}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="rounded-full border border-brand-cyan/40 bg-brand-cyan/15 px-6 py-2 text-sm text-brand-cyan shadow-brand-glow transition hover:border-brand-cyan/70 hover:bg-brand-cyan/25"
              >
                Seite neu laden
              </button>
              <button
                onClick={() => window.history.back()}
                className="rounded-full border border-white/20 bg-black/30 px-6 py-2 text-sm text-white/70 hover:border-brand-cyan/30"
              >
                Zurueck
              </button>
            </div>

            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="mt-6 text-left text-xs text-white/70">
                <summary className="cursor-pointer text-[11px] uppercase tracking-[0.3em] text-white/50">
                  Error Details (Dev Mode)
                </summary>
                <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-[11px] text-white/70">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
