import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
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

  private handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '24px',
          margin: '16px',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          color: '#f87171',
          fontFamily: 'sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: 0, fontWeight: 600 }}>Something went wrong loading this view</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
