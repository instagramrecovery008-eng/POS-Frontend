import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

/**
 * Error Boundary that catches JavaScript errors anywhere in its child
 * component tree and displays a fallback UI instead of crashing the page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('❌ Error Boundary caught:', error);
    if (errorInfo) {
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoBack = () => {
    this.handleReset();
    // Try to navigate back if possible
    if (window.history?.length > 1) {
      window.history.back();
    }
  };

  render() {
    if (this.state.hasError) {
      // If a custom fallback was provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center p-8 min-h-[200px]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Something went wrong</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                An unexpected error occurred. Please try again.
              </p>
            </div>
            {this.props.showError && (
              <details className="text-left">
                <summary className="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-slate-600">
                  Error details
                </summary>
                <pre className="mt-2 p-2 bg-slate-50 rounded-lg text-[9px] text-red-600 font-mono overflow-auto max-h-32">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleGoBack}
                className="h-8.5 px-4 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Go Back
              </button>
              <button
                onClick={this.handleReset}
                className="h-8.5 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
