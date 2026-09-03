import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <div className="bg-red-100 p-3 rounded-full mb-4">
            <AlertCircle className="text-red-600" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-slate-600 mb-6 max-w-md">
            The application encountered an unexpected error. This might be due to a map or location service issue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
          >
            <RefreshCcw size={18} />
            Reload Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-slate-100 rounded-lg text-left text-xs overflow-auto max-w-full text-red-700">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return (this as any).props.children;
  }
}
