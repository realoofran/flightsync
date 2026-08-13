import { useState } from 'react';
import { Search } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import './CallsignFinder.css';

const bridge = getBridge();

/**
 * Alternative to "Pull from VATSIM" (which only ever looks up YOUR OWN
 * filed flight plan by CID) — this searches every pilot currently online
 * on the VATSIM network by callsign (e.g. "DLH4LR"), so you can load
 * someone else's flight, or find yours without knowing your own CID by
 * heart. Backed by the same public data.vatsim.net feed vatsimClient.js
 * already uses for ATC status and "Pull from VATSIM" — no scraping, no
 * FlightRadar24 involved (see flightRadar24.js for why not).
 */
export default function CallsignFinder({ onSelect, onCancel }) {
  const { t } = useAppSettings();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const found = await bridge.vatsim.findByCallsign(trimmed);
      setResults(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="confirm-form callsign-finder">
      <div className="confirm-form__row">
        <label><Search size={12} style={{ verticalAlign: -1 }} /> {t('callsignSearchLabel')}</label>
        <input
          autoFocus
          value={query}
          maxLength={10}
          placeholder={t('callsignSearchPlaceholder')}
          style={{ textTransform: 'none' }}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
      </div>
      <p className="confirm-form__hint">{t('callsignSearchHint')}</p>

      <div className="confirm-form__actions">
        <button className="btn btn--primary btn--small" onClick={search} disabled={searching || !query.trim()}>
          {searching ? t('searchingEllipsis') : t('searchButton')}
        </button>
        <button className="btn btn--ghost btn--small" onClick={onCancel}>{t('cancel')}</button>
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {results && results.length === 0 && (
        <p className="callsign-finder__empty">{t('callsignSearchNoMatches', { query: query.trim() })}</p>
      )}

      {results && results.length > 0 && (
        <div className="callsign-finder__results">
          {results.map((f) => (
            <div className="callsign-finder__row" key={`${f.callsign}-${f.pilotCid}`}>
              <span className="led led--green" />
              <div className="callsign-finder__info">
                <span className="callsign-finder__callsign">{f.callsign}</span>
                <span className="callsign-finder__route">
                  {f.origin} → {f.destination}
                  {f.aircraftIcao ? ` · ${f.aircraftIcao}` : ''}
                  {f.pilotName ? ` · ${f.pilotName}` : ''}
                </span>
                {(f.altitude != null || f.groundspeed != null) && (
                  <span className="callsign-finder__telemetry">
                    {f.altitude != null && t('callsignAltitude', { altitude: f.altitude.toLocaleString() })}
                    {f.altitude != null && f.groundspeed != null ? ' · ' : ''}
                    {f.groundspeed != null && t('callsignGroundspeed', { speed: f.groundspeed })}
                  </span>
                )}
              </div>
              <button className="btn btn--primary btn--small" onClick={() => onSelect(f)}>
                {t('useThisFlightButton')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
