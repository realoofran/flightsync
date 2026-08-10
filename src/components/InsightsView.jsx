import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, BookMarked, Repeat } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useSyncState } from '../lib/SyncStateContext.jsx';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import AddonBreakdown from './AddonBreakdown.jsx';
import { formatBytes } from '../lib/formatBytes.js';
import { CONTENT_TYPE_COLORS } from '../lib/contentTypeColors.js';
import './InsightsView.css';

const bridge = getBridge();

/**
 * Pulls together data every other tab already collects (library, disk
 * usage, sync history) into one glanceable view — no new backend beyond
 * what Library's own disk-usage button already calls. Bars are a single
 * sequential hue per chart (never a rainbow) so magnitude reads at a
 * glance; the sync-activity chart is the one place with two real series
 * (linked vs unlinked), so it gets a legend and the app's existing
 * green/red semantic pair rather than a third arbitrary color.
 */
export default function InsightsView({ setTab }) {
  const { t } = useAppSettings();
  const { submitManualPlan } = useSyncState();
  const [addons, setAddons] = useState([]);
  const [sizes, setSizes] = useState(null);
  const [history, setHistory] = useState([]);
  const [flightLog, setFlightLog] = useState([]);
  const [loadingSizes, setLoadingSizes] = useState(false);

  useEffect(() => {
    bridge.library.list().then(setAddons);
    bridge.sync.history().then(setHistory);
    bridge.flightLog.list().then(setFlightLog);
  }, []);

  // Rebuilds a manual-entry-shaped FlightPlan from a logged flight and
  // feeds it straight into the same submitManualPlan -> sync:preview
  // pipeline manual entry already uses — no new backend logic, same
  // "reuse the existing plumbing" approach as Loadouts and the VATSIM
  // pull. Weights/fuel/route-string aren't recoverable from a logbook
  // entry, so ofp stays null, same as any other manual-style plan.
  const flyAgain = (f) => {
    submitManualPlan({
      origin: f.origin,
      destination: f.destination,
      alternates: [],
      aircraftIcao: f.aircraftIcao,
      airlineIcao: f.airlineIcao ?? null,
      callsign: f.callsign ?? null,
      fetchedAt: new Date().toISOString(),
      source: 'logbook',
      originCoord: null,
      destinationCoord: null,
      routePoints: [],
      ofp: null,
    });
    setTab?.('sync');
  };

  const loadSizes = async () => {
    setLoadingSizes(true);
    try {
      setSizes(await bridge.library.getFolderSizes());
    } finally {
      setLoadingSizes(false);
    }
  };

  const stats = useMemo(() => ({
    total: addons.length,
    scenery: addons.filter(a => a.contentType === 'SCENERY').length,
    aircraft: addons.filter(a => a.contentType === 'AIRCRAFT').length,
    livery: addons.filter(a => a.contentType === 'LIVERY').length,
    other: addons.filter(a => a.contentType === 'OTHER').length,
  }), [addons]);

  const regionCounts = useMemo(() => {
    const counts = {};
    for (const a of addons) {
      if (!a.region) continue;
      counts[a.region] = (counts[a.region] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [addons]);

  const sizeByType = useMemo(() => {
    if (!sizes) return null;
    const totals = {};
    for (const a of addons) totals[a.contentType] = (totals[a.contentType] ?? 0) + (sizes[a.id] ?? 0);
    return Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [addons, sizes]);

  // Oldest -> newest so the trend reads left-to-right like a timeline.
  const recentSyncs = useMemo(() => [...history].slice(0, 8).reverse(), [history]);

  const logbookStats = useMemo(() => {
    if (flightLog.length === 0) return null;
    const airports = new Set();
    const aircraftCounts = {};
    let totalDistance = 0;
    for (const f of flightLog) {
      if (f.origin) airports.add(f.origin);
      if (f.destination) airports.add(f.destination);
      if (f.aircraftIcao) aircraftCounts[f.aircraftIcao] = (aircraftCounts[f.aircraftIcao] ?? 0) + 1;
      totalDistance += f.distanceNm ?? 0;
    }
    const mostFlown = Object.entries(aircraftCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    return { totalFlights: flightLog.length, totalDistance, uniqueAirports: airports.size, mostFlown };
  }, [flightLog]);

  const maxRegion = Math.max(1, ...regionCounts.map(([, c]) => c));
  const maxSize = Math.max(1, ...(sizeByType ?? []).map(([, v]) => v));
  const maxSyncCount = Math.max(1, ...recentSyncs.flatMap(s => [s.linkedCount, s.unlinkedCount]));

  return (
    <motion.div className="view view--wide" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2>{t('insightsTitle')}</h2>

      {addons.length === 0 ? (
        <div className="library-empty glass notched">
          <BarChart3 size={36} color="var(--text-faint)" />
          <h3 className="library-empty__title">{t('insightsNothingTitle')}</h3>
          <p>{t('insightsNothingBody')}</p>
        </div>
      ) : (
        <div className="insights-grid">
          <section className="insights-card glass notched">
            <h3 className="insights-card__title">{t('addonBreakdownTitle')}</h3>
            <AddonBreakdown stats={stats} />
          </section>

          <section className="insights-card glass notched">
            <h3 className="insights-card__title">{t('sceneryByRegionTitle')}</h3>
            {regionCounts.length === 0 ? (
              <p className="insights-card__empty">{t('noSceneryWithRegion')}</p>
            ) : (
              <div className="insights-bars">
                {regionCounts.map(([region, count]) => (
                  <div className="insights-bar-row" key={region}>
                    <span className="insights-bar-row__label">{region}</span>
                    <div className="insights-bar-row__track">
                      <div className="insights-bar-row__fill" style={{ width: `${(count / maxRegion) * 100}%`, background: 'var(--cyan-text)' }} />
                    </div>
                    <span className="insights-bar-row__value">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="insights-card glass notched">
            <div className="insights-card__header">
              <h3 className="insights-card__title">{t('diskUsageByTypeTitle')}</h3>
              {!sizes && (
                <button className="btn btn--ghost btn--small" onClick={loadSizes} disabled={loadingSizes}>
                  {loadingSizes ? t('measuringEllipsis') : t('measureButton')}
                </button>
              )}
            </div>
            {!sizeByType ? (
              <p className="insights-card__empty">{t('measureHint')}</p>
            ) : (
              <div className="insights-bars">
                {sizeByType.map(([type, bytes]) => {
                  const color = CONTENT_TYPE_COLORS[type] ?? CONTENT_TYPE_COLORS.OTHER;
                  return (
                    <div className="insights-bar-row" key={type}>
                      <span className="insights-bar-row__label">{color.label}</span>
                      <div className="insights-bar-row__track">
                        <div className="insights-bar-row__fill" style={{ width: `${(bytes / maxSize) * 100}%`, background: `var(${color.var})` }} />
                      </div>
                      <span className="insights-bar-row__value">{formatBytes(bytes)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="insights-card glass notched insights-card--wide">
            <h3 className="insights-card__title">{t('recentSyncActivityTitle')}</h3>
            {recentSyncs.length === 0 ? (
              <p className="insights-card__empty">{t('noSyncsAppliedYet')}</p>
            ) : (
              <>
                <div className="insights-legend">
                  <span><span className="insights-legend__dot insights-legend__dot--green" /> {t('linkedLegend')}</span>
                  <span><span className="insights-legend__dot insights-legend__dot--red" /> {t('unlinkedLegend')}</span>
                </div>
                <div className="insights-trend">
                  {recentSyncs.map((s, i) => (
                    <div className="insights-trend__col" key={i} title={new Date(s.timestamp).toLocaleString()}>
                      <div className="insights-trend__bars">
                        <div className="insights-trend__bar insights-trend__bar--green" style={{ height: `${Math.max(2, (s.linkedCount / maxSyncCount) * 100)}%` }} />
                        <div className="insights-trend__bar insights-trend__bar--red" style={{ height: `${Math.max(2, (s.unlinkedCount / maxSyncCount) * 100)}%` }} />
                      </div>
                      <span className="insights-trend__label">
                        {new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="insights-card glass notched insights-card--wide">
            <h3 className="insights-card__title"><BookMarked size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{t('pilotLogbookTitle')}</h3>
            {!logbookStats ? (
              <p className="insights-card__empty">{t('noFlightsLoggedYet')}</p>
            ) : (
              <>
                <div className="logbook-stats">
                  <div className="logbook-stat">
                    <span className="logbook-stat__value">{logbookStats.totalFlights}</span>
                    <span className="logbook-stat__label">{t('flightsLoggedStat')}</span>
                  </div>
                  <div className="logbook-stat">
                    <span className="logbook-stat__value">{logbookStats.totalDistance.toLocaleString()}</span>
                    <span className="logbook-stat__label">{t('totalNmStat')}</span>
                  </div>
                  <div className="logbook-stat">
                    <span className="logbook-stat__value">{logbookStats.uniqueAirports}</span>
                    <span className="logbook-stat__label">{t('uniqueAirportsStat')}</span>
                  </div>
                  <div className="logbook-stat">
                    <span className="logbook-stat__value">{logbookStats.mostFlown}</span>
                    <span className="logbook-stat__label">{t('mostFlownTypeStat')}</span>
                  </div>
                </div>
                <div className="logbook-routes">
                  {flightLog.slice(0, 8).map((f, i) => (
                    <div className="logbook-route-row" key={i}>
                      <span className="logbook-route-row__date">
                        {new Date(f.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="logbook-route-row__route">
                        {f.origin ?? '????'}<span className="logbook-route-row__arrow">→</span>{f.destination ?? '????'}
                      </span>
                      <span className="logbook-route-row__meta">
                        {f.aircraftIcao ?? '—'}{f.airlineIcao ? ` · ${f.airlineIcao}` : ''}{f.callsign ? ` · ${f.callsign}` : ''}
                      </span>
                      <span className="logbook-route-row__distance">{f.distanceNm ? `${f.distanceNm} nm` : '—'}</span>
                      <button
                        className="logbook-route-row__fly-again"
                        onClick={() => flyAgain(f)}
                        disabled={!f.origin || !f.destination || !f.aircraftIcao}
                        title={t('flyAgainTitle')}
                      >
                        <Repeat size={11} /> {t('flyAgainButton')}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </motion.div>
  );
}
