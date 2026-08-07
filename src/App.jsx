import { useState, useEffect } from 'react';
import { PlaneTakeoff, Boxes, Settings2, History, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SyncView from './components/SyncView.jsx';
import LibraryView from './components/LibraryView.jsx';
import SettingsView from './components/SettingsView.jsx';
import HistoryView from './components/HistoryView.jsx';
import OnboardingWizard from './components/OnboardingWizard.jsx';
import Logo from './components/Logo.jsx';
import AddonBreakdown from './components/AddonBreakdown.jsx';
import UpdateIndicator from './components/UpdateIndicator.jsx';
import { getBridge, isPreloadBroken } from './lib/mockBridge.js';
import { useAppSettings } from './lib/AppSettingsContext.jsx';
import { useSyncState } from './lib/SyncStateContext.jsx';
import { relativeTime } from './lib/timeFormat.js';

const bridge = getBridge();

export default function App() {
  const { t, settings } = useAppSettings();
  const { plan, lastSync } = useSyncState();
  const [tab, setTab] = useState('sync');
  const [stats, setStats] = useState(null);
  const [recentSyncs, setRecentSyncs] = useState([]);
  const preloadBroken = isPreloadBroken();

  useEffect(() => {
    bridge.sync.history().then(h => setRecentSyncs(h.slice(0, 3)));
  }, [lastSync]);

  const TABS = [
    { id: 'sync', label: t('tabSync'), icon: PlaneTakeoff },
    { id: 'library', label: t('tabLibrary'), icon: Boxes },
    { id: 'history', label: t('tabHistory'), icon: History },
    { id: 'settings', label: t('tabSettings'), icon: Settings2 },
  ];

  useEffect(() => {
    bridge.library.list().then(addons => {
      setStats({
        total: addons.length,
        pending: addons.filter(a => !a.confirmed).length,
        scenery: addons.filter(a => a.contentType === 'SCENERY').length,
        aircraft: addons.filter(a => a.contentType === 'AIRCRAFT').length,
        livery: addons.filter(a => a.contentType === 'LIVERY').length,
        other: addons.filter(a => a.contentType === 'OTHER').length,
      });
    });
  }, [tab]);

  const utcTime = useUtcClock();

  if (!settings.onboardingComplete) {
    return (
      <div className="app-frame">
        <div className="titlebar-drag" />
        <OnboardingWizard />
      </div>
    );
  }

  return (
    <div className="app-frame">
      <div className="titlebar-drag" />

      <header className="topbar notched glass">
        <div className="topbar__brand">
          <Logo size={34} />
        </div>

        <nav className="topbar__nav">
          {TABS.map(t2 => {
            const Icon = t2.icon;
            const active = tab === t2.id;
            return (
              <button
                key={t2.id}
                className={`topbar__nav-tab ${active ? 'topbar__nav-tab--active' : ''}`}
                onClick={() => setTab(t2.id)}
              >
                {active && (
                  <motion.span
                    layoutId="topbar-active-pill"
                    className="topbar__nav-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={15} style={{ position: 'relative', zIndex: 1 }} />
                <span style={{ position: 'relative', zIndex: 1 }}>{t2.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="topbar__meta">
          <span className="topbar__utc">{utcTime}Z</span>
          <UpdateIndicator />
        </div>
      </header>

      <div className="body-row">
        <aside className="status-panel glass notched">
          <AnimatePresence>
            {plan && (
              <motion.button
                className="status-panel__flight-badge"
                onClick={() => setTab('sync')}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <span className="status-panel__flight-badge-dot" />
                <span className="status-panel__flight-badge-route">{plan.origin} → {plan.destination}</span>
                <span className="status-panel__flight-badge-callsign">{plan.callsign || ''}</span>
              </motion.button>
            )}
          </AnimatePresence>

          {stats && (
            <>
              <div className="status-panel__section-label">LIBRARY BREAKDOWN</div>
              <AddonBreakdown stats={stats} />

              <div className="status-panel__divider" />

              {stats.pending > 0 && (
                <button className="status-panel__stat-row status-panel__stat-row--amber" onClick={() => setTab('library')}>
                  <span className="status-panel__stat-label"><AlertTriangle size={12} /> Needs confirmation</span>
                  <span className="status-panel__stat-value">{stats.pending}</span>
                </button>
              )}
            </>
          )}

          {recentSyncs.length > 0 && (
            <>
              <div className="status-panel__divider" />
              <div className="status-panel__section-label">RECENT ACTIVITY</div>
              <button className="status-panel__activity" onClick={() => setTab('history')}>
                {recentSyncs.map((sync, i) => (
                  <div key={i} className="status-panel__activity-row">
                    <span className={`status-panel__activity-dot ${sync.errorCount > 0 ? 'status-panel__activity-dot--amber' : ''}`} />
                    <span className="status-panel__activity-time">{relativeTime(sync.timestamp)}</span>
                    <span className="status-panel__activity-counts">+{sync.linkedCount} −{sync.unlinkedCount}</span>
                  </div>
                ))}
              </button>
            </>
          )}

          <div className="status-panel__footer">
            <span>{stats ? `${stats.total} ${t('addonsTracked')}` : ''}</span>
          </div>
        </aside>

        <main className="content">
          {preloadBroken && (
            <div className="banner banner--error" style={{ marginBottom: 20 }}>
              The app's Electron bridge failed to load — you're seeing sample data, not your real files.
              Check the terminal you ran <code>npm run dev</code> from for a "PRELOAD FAILED TO LOAD" error.
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {tab === 'sync' && <SyncView />}
              {tab === 'library' && <LibraryView />}
              {tab === 'history' && <HistoryView />}
              {tab === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

/** Live UTC/Zulu clock, updated once a second — a small authentic EFB/
 * avionics touch (real flight-planning tools always show Zulu time), and
 * incidentally something that's always visibly moving even when the rest
 * of the app is idle. */
function useUtcClock() {
  const [time, setTime] = useState(formatUtc(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatUtc(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

function formatUtc(d) {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}
