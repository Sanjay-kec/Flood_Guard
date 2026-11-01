import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary - catches runtime rendering errors in page components
 * and displays an informative error card rather than crashing the entire app to a white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[FloodGuard ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main id="main-content" style={{ padding: '40px 20px', maxWidth: '720px', margin: '0 auto' }}>
          <div
            style={{
              padding: '28px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
            role="alert"
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden="true"
            >
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#991b1b' }}>
              {this.props.fallbackTitle || 'Unable to Display Content'}
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c', maxWidth: '500px', lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred. The application remains running.'}
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={this.handleReset}
              style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} aria-hidden="true" />
              <span>Retry Component</span>
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

