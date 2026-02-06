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
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-900 to-red-700">
          <div className="text-center px-4">
            <h1 className="text-4xl font-bold text-white mb-4">⚠️ Oops!</h1>
            <p className="text-red-100 mb-4 text-lg">Something went wrong</p>
            
            {this.state.error && (
              <p className="text-red-200 mb-6 font-mono text-sm break-all">
                {this.state.error.message || "An unexpected error occurred"}
              </p>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-white text-red-700 rounded-lg font-semibold hover:bg-red-50 transition"
              >
                Reload Page
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-6 py-2 bg-red-800 text-white rounded-lg font-semibold hover:bg-red-900 transition"
              >
                Go Back
              </button>
            </div>

            {process.env.NODE_ENV === "development" && this.state.errorInfo && (
              <details className="mt-8 text-left bg-red-800 p-4 rounded text-red-100 text-xs max-w-2xl">
                <summary className="cursor-pointer font-bold mb-2">Error Details (Dev Mode)</summary>
                <pre className="whitespace-pre-wrap break-words overflow-auto max-h-64">
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
