import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Last-resort catch for render-time exceptions (malformed DB entry,
 * unexpected SimBrief response shape, etc.) — without this, any such error
 * white-screens the whole app with no way back in for a public user.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[FlightSync] Unhandled render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="titlebar-drag" />
        <div className="error-boundary__center">
          <div className="error-boundary__card glass notched">
            <AlertTriangle size={32} color="var(--red)" />
            <h2>Something went wrong</h2>
            <p>
              FlightSync hit an unexpected error and couldn't continue rendering. Your addon
              files and settings are untouched — this is a display-only failure.
            </p>
            <pre className="error-boundary__detail">{String(this.state.error?.message ?? this.state.error)}</pre>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              <RotateCcw size={14} /> Reload FlightSync
            </button>
          </div>
        </div>
      </div>
    );
  }
}
