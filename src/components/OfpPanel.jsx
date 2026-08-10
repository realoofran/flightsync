import { useState, useEffect, useCallback } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import './OfpPanel.css';

const bridge = getBridge();

export default function OfpPanel({ ofp, origin, destination }) {
  const { t } = useAppSettings();
  const [atcStatus, setAtcStatus] = useState(null);
  const [loadingAtc, setLoadingAtc] = useState(false);
  const [atcError, setAtcError] = useState(null);

  const loadAtcStatus = useCallback(() => {
    if (!origin && !destination) return;
    setLoadingAtc(true);
    setAtcError(null);
    bridge.vatsim.getAtcStatus([origin, destination].filter(Boolean))
      .then(setAtcStatus)
      .catch((err) => setAtcError(err.message))
      .finally(() => setLoadingAtc(false));
  }, [origin, destination]);

  // Fetched once when the route loads, not polled — VATSIM's own feed only
  // refreshes server-side every ~15s anyway, and this is a point-in-time
  // check ("is anyone online right now"), not a live tracker. Refresh
  // button below covers "let me check again before I fly."
  useEffect(() => { loadAtcStatus(); }, [loadAtcStatus]);

  if (!ofp && !origin && !destination) return null;

  return (
    <div className="ofp-panel notched">
      {(origin || destination) && (
        <div className={`ofp-section ${!ofp ? 'ofp-section--last' : ''}`}>
          <div className="ofp-panel__section-label-row">
            <div className="ofp-panel__section-label">
              <Radio size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{t('atcOnlineLabel')}
            </div>
            <button
              className="ofp-panel__atc-refresh"
              onClick={loadAtcStatus}
              disabled={loadingAtc}
              title={t('checkVatsimAgainTitle')}
              aria-label={t('refreshAtcAria')}
            >
              <RefreshCw size={11} className={loadingAtc ? 'spin' : ''} />
            </button>
          </div>
          {atcError ? (
            <p className="ofp-panel__atc-error">{atcError}</p>
          ) : (
            <div className="ofp-panel__atc-list">
              {[{ icao: origin, label: 'DEP' }, { icao: destination, label: 'ARR' }].filter(a => a.icao).map(({ icao, label }) => {
                const controllers = atcStatus?.[icao];
                return (
                  <div className="ofp-panel__atc-row" key={icao}>
                    <span className="ofp-panel__atc-airport">{label} {icao}</span>
                    {controllers === undefined ? (
                      <span className="ofp-panel__atc-empty">{loadingAtc ? t('checkingEllipsis') : '—'}</span>
                    ) : controllers.length === 0 ? (
                      <span className="ofp-panel__atc-empty">{t('noAtcOnline')}</span>
                    ) : (
                      <span className="ofp-panel__atc-controllers">
                        {controllers.map(c => `${c.callsign} ${c.frequency}`).join('  ·  ')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {ofp && (
        <>
          {(ofp.originName || ofp.destinationName) && (
            <div className="ofp-panel__airport-names">
              {ofp.originName && <span>{ofp.originName}</span>}
              {(ofp.originName || ofp.destinationName) && <span className="ofp-panel__airport-arrow">→</span>}
              {ofp.destinationName && <span>{ofp.destinationName}</span>}
            </div>
          )}

          <Section label={t('sectionFlightPlan')}>
            <Stat label={t('statDistance')} value={ofp.distanceNm ? `${Math.round(ofp.distanceNm)} nm` : '—'} />
            <Stat label={t('statTimeEnroute')} value={formatDuration(ofp.estTimeEnrouteSec)} />
            <Stat label={t('statCruiseAlt')} value={ofp.cruiseAltitudeFt ? `FL${Math.round(ofp.cruiseAltitudeFt / 100)}` : '—'} />
            <Stat label={t('statCostIndex')} value={ofp.costIndex ?? '—'} />
          </Section>

          <Section label={t('sectionWeights')}>
            <Stat label={t('statZfw')} value={ofp.zfwLbs ? `${Math.round(ofp.zfwLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statTakeoff')} value={ofp.towLbs ? `${Math.round(ofp.towLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statLanding')} value={ofp.landingWeightLbs ? `${Math.round(ofp.landingWeightLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statMaxTow')} value={ofp.maxTowLbs ? `${Math.round(ofp.maxTowLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statPax')} value={ofp.paxCount ?? '—'} />
            <Stat label={t('statCargo')} value={ofp.cargoLbs ? `${Math.round(ofp.cargoLbs).toLocaleString()} lb` : '—'} />
          </Section>

          <Section label={t('sectionFuel')}>
            <Stat label={t('statBlockFuel')} value={ofp.blockFuelLbs ? `${Math.round(ofp.blockFuelLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statTripFuel')} value={ofp.tripFuelLbs ? `${Math.round(ofp.tripFuelLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statTaxiFuel')} value={ofp.taxiFuelLbs ? `${Math.round(ofp.taxiFuelLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statReserve')} value={ofp.reserveFuelLbs ? `${Math.round(ofp.reserveFuelLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statAltnFuel')} value={ofp.alternateFuelLbs ? `${Math.round(ofp.alternateFuelLbs).toLocaleString()} lb` : '—'} />
            <Stat label={t('statAvgWind')} value={ofp.avgWindComponent ? `${ofp.avgWindComponent} kt` : '—'} />
          </Section>

          {ofp.alternateIcao && (
            <Section label={t('sectionAlternate')} grid={false}>
              <div className="ofp-panel__route-value">
                {ofp.alternateIcao}{ofp.alternateName ? ` — ${ofp.alternateName}` : ''}
              </div>
            </Section>
          )}

          {(ofp.schedOutUtc || ofp.schedInUtc) && (
            <Section label={t('sectionSchedule')}>
              <Stat label={t('statOut')} value={formatUtcTime(ofp.schedOutUtc)} />
              <Stat label={t('statIn')} value={formatUtcTime(ofp.schedInUtc)} />
              <Stat label={t('statTaxiOut')} value={ofp.taxiOutMin != null ? `${ofp.taxiOutMin} min` : '—'} />
              <Stat label={t('statTaxiIn')} value={ofp.taxiInMin != null ? `${ofp.taxiInMin} min` : '—'} />
            </Section>
          )}

          {(ofp.originMetar || ofp.destinationMetar) && (
            <Section label={t('sectionWeather')} grid={false}>
              <div className="ofp-panel__metar-list">
                {ofp.originMetar && <div className="ofp-panel__metar">{ofp.originMetar}</div>}
                {ofp.destinationMetar && <div className="ofp-panel__metar">{ofp.destinationMetar}</div>}
              </div>
            </Section>
          )}

          {ofp.routeString && (
            <Section label={t('sectionRoute')} grid={false} last>
              <div className="ofp-panel__route-value">{ofp.routeString}</div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, children, grid = true, last = false }) {
  return (
    <div className={`ofp-section ${last ? 'ofp-section--last' : ''}`}>
      <div className="ofp-panel__section-label">{label}</div>
      {grid ? <div className="ofp-panel__stats">{children}</div> : children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="ofp-stat">
      <span className="ofp-stat__label">{label}</span>
      <span className="ofp-stat__value">{value}</span>
    </div>
  );
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatUtcTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}
