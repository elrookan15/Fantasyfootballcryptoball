import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-900 border border-red-500/20 rounded-xl p-6 shadow-2xl shadow-red-900/10">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-gray-100 tracking-tight">System Error Detected</h2>
                <p className="text-sm text-gray-400">
                  A critical error occurred while rendering this module.
                </p>
              </div>

              {this.state.error && (
                <div className="w-full bg-black/40 rounded-lg p-3 text-left overflow-auto border border-gray-800">
                  <p className="text-xs font-mono text-red-400 break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <button
                onClick={this.handleReset}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-lg transition-colors border border-gray-700 font-medium text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Recover System
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
