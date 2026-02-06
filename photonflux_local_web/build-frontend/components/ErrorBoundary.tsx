import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-bg text-text p-8 flex items-center justify-center">
          <div className="max-w-md w-full bg-card border border-red-500/50 rounded-xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Application Error</h2>
            <div className="bg-black/40 rounded p-4 mb-4 overflow-auto max-h-40">
              <p className="font-mono text-sm text-red-300 whitespace-pre-wrap">
                {this.state.error?.message}
              </p>
            </div>
            <p className="text-muted text-sm mb-6">
              An unexpected error occurred. Please try refreshing the page or check the Home Assistant logs.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
