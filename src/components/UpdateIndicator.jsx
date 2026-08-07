import { Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useUpdater } from '../lib/useUpdater.js';

/**
 * Lives in the top bar next to the version number — normally just shows the
 * version, but becomes an actionable prompt the moment an update is ready.
 * Errors (no internet, no GitHub release published yet, dev mode) are
 * deliberately silent here — this is a background convenience, not
 * something that should alarm a user who's just offline for a minute.
 */
export default function UpdateIndicator() {
  const { status, install } = useUpdater();

  if (status.state === 'ready') {
    return (
      <button className="update-indicator update-indicator--ready" onClick={install}>
        <Download size={12} /> Restart to update to v{status.version}
      </button>
    );
  }

  if (status.state === 'downloading') {
    return (
      <span className="update-indicator">
        <RefreshCw size={11} className="spin" /> Downloading update… {status.percent ?? 0}%
      </span>
    );
  }

  if (status.state === 'available') {
    return (
      <span className="update-indicator">
        <Download size={11} /> v{status.version} available
      </span>
    );
  }

  if (status.state === 'checking') {
    return (
      <span className="topbar__version">
        <RefreshCw size={10} className="spin" /> v{__APP_VERSION__}
      </span>
    );
  }

  if (status.state === 'up-to-date') {
    return (
      <span className="topbar__version" title="You're on the latest version">
        <CheckCircle2 size={10} /> v{__APP_VERSION__}
      </span>
    );
  }

  return <span className="topbar__version">v{__APP_VERSION__}</span>;
}
