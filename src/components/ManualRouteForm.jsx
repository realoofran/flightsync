import { useState } from 'react';
import { Radar } from 'lucide-react';
import { KNOWN_AIRCRAFT_TYPES, KNOWN_AIRLINES } from '../lib/knownCodes.js';
import { parseFlightRadar24Url } from '../lib/flightRadar24.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';

/**
 * Alternative to "Pull from SimBrief" for pilots who don't use it — produces
 * the same FlightPlan shape resolveRequiredAddons already consumes
 * (electron/lib/flightMatcher.js), just without the OFP extras (fuel,
 * weights, route string, coordinates) SimBrief provides, so RouteMap/OfpPanel
 * fall back to their existing "nothing to show" empty states.
 *
 * The optional FlightRadar24 field at the top only reads the flight/
 * callsign code out of the pasted URL text itself (see flightRadar24.js) —
 * it does NOT fetch anything from flightradar24.com, so it can't fill in
 * the route or aircraft type for you. Read those off the FR24 page you
 * have open and type them in below, same as any manual entry.
 */
export default function ManualRouteForm({ onSubmit, onCancel }) {
  const { t } = useAppSettings();
  const [fr24Url, setFr24Url] = useState('');
  const [fr24Error, setFr24Error] = useState(false);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [alternates, setAlternates] = useState('');
  const [aircraftIcao, setAircraftIcao] = useState('');
  const [airlineIcao, setAirlineIcao] = useState('');
  const [callsign, setCallsign] = useState('');

  const canSubmit = origin.trim().length === 4 && destination.trim().length === 4 && aircraftIcao.trim().length >= 3;

  const applyFr24Url = () => {
    if (!fr24Url.trim()) { setFr24Error(false); return; }
    const parsed = parseFlightRadar24Url(fr24Url);
    if (!parsed) {
      setFr24Error(true);
      return;
    }
    setFr24Error(false);
    setCallsign(parsed.flightCode);
    if (parsed.airlineIcao) setAirlineIcao(parsed.airlineIcao);
  };

  const submit = () => {
    onSubmit({
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      alternates: alternates.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      aircraftIcao: aircraftIcao.trim().toUpperCase(),
      airlineIcao: airlineIcao.trim().toUpperCase() || null,
      callsign: callsign.trim() || null,
      fetchedAt: new Date().toISOString(),
      source: 'manual',
      originCoord: null,
      destinationCoord: null,
      routePoints: [],
      ofp: null,
    });
  };

  return (
    <div className="confirm-form">
      <div className="confirm-form__row">
        <label><Radar size={12} style={{ verticalAlign: -1 }} /> {t('fr24LinkLabel')}</label>
        <input
          value={fr24Url}
          placeholder={t('fr24Placeholder')}
          onChange={(e) => setFr24Url(e.target.value)}
          onBlur={applyFr24Url}
          style={{ textTransform: 'none' }}
        />
      </div>
      {fr24Error && (
        <p className="confirm-form__hint confirm-form__hint--warn">
          {t('fr24ErrorHint')}
        </p>
      )}
      <p className="confirm-form__hint">
        {t('fr24ExplainHint')}
      </p>

      <div className="confirm-form__row">
        <label>{t('originIcaoLabel')}</label>
        <input autoFocus value={origin} maxLength={4} placeholder={t('originPlaceholder')} onChange={(e) => setOrigin(e.target.value.toUpperCase())} />
      </div>
      <div className="confirm-form__row">
        <label>{t('destinationIcaoLabel')}</label>
        <input value={destination} maxLength={4} placeholder={t('destinationPlaceholder')} onChange={(e) => setDestination(e.target.value.toUpperCase())} />
      </div>
      <div className="confirm-form__row">
        <label>{t('alternatesLabel')}</label>
        <input value={alternates} placeholder={t('alternatesPlaceholder')} onChange={(e) => setAlternates(e.target.value.toUpperCase())} />
      </div>
      <div className="confirm-form__row">
        <label>{t('aircraftTypeLabel')}</label>
        <input list="manual-aircraft-types" value={aircraftIcao} placeholder={t('aircraftTypePlaceholder')} onChange={(e) => setAircraftIcao(e.target.value.toUpperCase())} />
        <datalist id="manual-aircraft-types">
          {KNOWN_AIRCRAFT_TYPES.map(ac => <option key={ac} value={ac} />)}
        </datalist>
      </div>
      <div className="confirm-form__row">
        <label>{t('airlineLabel')}</label>
        <input list="manual-airlines" value={airlineIcao} placeholder={t('manualAirlinePlaceholder')} onChange={(e) => setAirlineIcao(e.target.value.toUpperCase())} />
        <datalist id="manual-airlines">
          {KNOWN_AIRLINES.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>
      <div className="confirm-form__row">
        <label>{t('callsignLabel')}</label>
        <input value={callsign} placeholder={t('callsignPlaceholder')} onChange={(e) => setCallsign(e.target.value)} style={{ textTransform: 'none' }} />
      </div>

      <div className="confirm-form__actions">
        <button className="btn btn--primary btn--small" onClick={submit} disabled={!canSubmit}>{t('useThisRouteButton')}</button>
        <button className="btn btn--ghost btn--small" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}
