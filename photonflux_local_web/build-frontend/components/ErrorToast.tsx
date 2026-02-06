import React from 'react';
import { AlertTriangle, X } from './icons';

export interface ErrorToastConfig {
  title?: string;
  message: string;
  code?: string;
  details?: string;
  retryLabel?: string;
  onRetry?: () => void | Promise<void>;
}

interface ErrorToastProps extends ErrorToastConfig {
  onClose: () => void;
}

const ErrorToast: React.FC<ErrorToastProps> = ({
  title,
  message,
  code,
  details,
  retryLabel,
  onRetry,
  onClose,
}) => {
  const handleRetry = () => {
    if (!onRetry) return;
    try {
      const result = onRetry();
      void Promise.resolve(result);
    } catch (err) {
      console.error('Retry handler failed:', err);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-4 flex justify-center pointer-events-none z-[100] px-4">
      <div className="w-full max-w-md pointer-events-auto">
        <div className="bg-[#111c30] border border-red-500/40 shadow-lg shadow-red-500/20 rounded-xl p-4 text-left text-sm text-text">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1 space-y-1">
              {title && <p className="text-xs font-semibold uppercase tracking-wide text-red-300/90">{title}</p>}
              <p className="text-sm text-text-strong leading-relaxed">{message}</p>
              {code && (
                <p className="text-[11px] font-mono uppercase tracking-wide text-red-200/80">
                  {code}
                </p>
              )}
              {details && <p className="text-xs text-muted/80 whitespace-pre-line">{details}</p>}
              {onRetry && (
                <button
                  onClick={handleRetry}
                  className="btn-secondary mt-2 inline-flex items-center justify-center px-3 py-1 text-xs"
                >
                  {retryLabel || 'Retry'}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-white transition-colors"
              aria-label="Close error notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorToast;
