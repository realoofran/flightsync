import { useState } from 'react';
import { Radar } from 'lucide-react';
import { KNOWN_AIRCRAFT_TYPES, KNOWN_AIRLINES } from '../lib/knownCodes.js';
import { parseFlightRadar24Url } from '../lib/flightRadar24.js';

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
        <label><Radar size={12} style={{ verticalAlign: -1 }} /> FlightRadar24 link (optional)</label>
        <input
          value={fr24Url}
          placeholder="Paste a flightradar24.com flight link…"
          onChange={(e) => setFr24Url(e.target.value)}
          onBlur={applyFr24Url}
          style={{ textTransform: 'none' }}
        />
      </div>
      {fr24Error && (
        <p className="confirm-form__hint confirm-form__hint--warn">
          Doesn't look like a flightradar24.com flight link — leave it blank and fill in the fields
          below by hand instead.
        </p>
      )}
      <p className="confirm-form__hint">
        This only reads the flight number out of the link's text — it doesn't fetch anything from
        FlightRadar24, so it fills in the callsign/airline below but not the route or aircraft.
        Read those off the FR24 page and type them in.
      </p>

      <div className="confirm-form__row">
        <label>Origin ICAO</label>
        <input autoFocus value={origin} maxLength={4} placeholder="e.g. LTFM" onChange={(e) => setOrigin(e.target.value.toUpperCase())} />
      </div>
      <div className="confirm-form__row">
        <label>Destination ICAO</label>
        <input value={destination} maxLength={4} placeholder="e.g. EDDM" onChange={(e) => setDestination(e.target.value.toUpperCase())} />
      </div>
      <div className="confirm-form__row">
        <label>Alternate(s)</label>
        <input value={alternates} placeholder="e.g. EDDF, EDDL (comma-separated, optional)" onChange={(e) => setAlternates(e.target.value.toUpperCase())} />
      </div>
      <div className="confirm-form__row">
        <label>Aircraft type</label>
        <input list="manual-aircraft-types" value={aircraftIcao} placeholder="e.g. A21N" onChange={(e) => setAircraftIcao(e.target.value.toUpperCase())} />
        <datalist id="manual-aircraft-types">
          {KNOWN_AIRCRAFT_TYPES.map(t => <option key={t} value={t} />)}
        </datalist>
      </div>
      <div className="confirm-form__row">
        <label>Airline</label>
        <input list="manual-airlines" value={airlineIcao} placeholder="optional, leave blank for GA/private" onChange={(e) => setAirlineIcao(e.target.value.toUpperCase())} />
        <datalist id="manual-airlines">
          {KNOWN_AIRLINES.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>
      <div className="confirm-form__row">
        <label>Callsign</label>
        <input value={callsign} placeholder="optional" onChange={(e) => setCallsign(e.target.value)} style={{ textTransform: 'none' }} />
      </div>

      <div className="confirm-form__actions">
        <button className="btn btn--primary btn--small" onClick={submit} disabled={!canSubmit}>Use this route</button>
        <button className="btn btn--ghost btn--small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
