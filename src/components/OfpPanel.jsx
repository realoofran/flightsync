import './OfpPanel.css';

export default function OfpPanel({ ofp }) {
  if (!ofp) return null;

  return (
    <div className="ofp-panel notched">
      {(ofp.originName || ofp.destinationName) && (
        <div className="ofp-panel__airport-names">
          {ofp.originName && <span>{ofp.originName}</span>}
          {(ofp.originName || ofp.destinationName) && <span className="ofp-panel__airport-arrow">→</span>}
          {ofp.destinationName && <span>{ofp.destinationName}</span>}
        </div>
      )}

      <Section label="FLIGHT PLAN">
        <Stat label="DISTANCE" value={ofp.distanceNm ? `${Math.round(ofp.distanceNm)} nm` : '—'} />
        <Stat label="TIME ENROUTE" value={formatDuration(ofp.estTimeEnrouteSec)} />
        <Stat label="CRUISE ALT" value={ofp.cruiseAltitudeFt ? `FL${Math.round(ofp.cruiseAltitudeFt / 100)}` : '—'} />
        <Stat label="COST INDEX" value={ofp.costIndex ?? '—'} />
      </Section>

      <Section label="WEIGHTS">
        <Stat label="ZFW" value={ofp.zfwLbs ? `${Math.round(ofp.zfwLbs).toLocaleString()} lb` : '—'} />
        <Stat label="TAKEOFF" value={ofp.towLbs ? `${Math.round(ofp.towLbs).toLocaleString()} lb` : '—'} />
        <Stat label="LANDING" value={ofp.landingWeightLbs ? `${Math.round(ofp.landingWeightLbs).toLocaleString()} lb` : '—'} />
        <Stat label="MAX TOW" value={ofp.maxTowLbs ? `${Math.round(ofp.maxTowLbs).toLocaleString()} lb` : '—'} />
        <Stat label="PAX" value={ofp.paxCount ?? '—'} />
        <Stat label="CARGO" value={ofp.cargoLbs ? `${Math.round(ofp.cargoLbs).toLocaleString()} lb` : '—'} />
      </Section>

      <Section label="FUEL">
        <Stat label="BLOCK FUEL" value={ofp.blockFuelLbs ? `${Math.round(ofp.blockFuelLbs).toLocaleString()} lb` : '—'} />
        <Stat label="TRIP FUEL" value={ofp.tripFuelLbs ? `${Math.round(ofp.tripFuelLbs).toLocaleString()} lb` : '—'} />
        <Stat label="TAXI FUEL" value={ofp.taxiFuelLbs ? `${Math.round(ofp.taxiFuelLbs).toLocaleString()} lb` : '—'} />
        <Stat label="RESERVE" value={ofp.reserveFuelLbs ? `${Math.round(ofp.reserveFuelLbs).toLocaleString()} lb` : '—'} />
        <Stat label="ALTN FUEL" value={ofp.alternateFuelLbs ? `${Math.round(ofp.alternateFuelLbs).toLocaleString()} lb` : '—'} />
        <Stat label="AVG WIND" value={ofp.avgWindComponent ? `${ofp.avgWindComponent} kt` : '—'} />
      </Section>

      {ofp.alternateIcao && (
        <Section label="ALTERNATE" grid={false}>
          <div className="ofp-panel__route-value">
            {ofp.alternateIcao}{ofp.alternateName ? ` — ${ofp.alternateName}` : ''}
          </div>
        </Section>
      )}

      {(ofp.schedOutUtc || ofp.schedInUtc) && (
        <Section label="SCHEDULE (UTC)">
          <Stat label="OUT" value={formatUtcTime(ofp.schedOutUtc)} />
          <Stat label="IN" value={formatUtcTime(ofp.schedInUtc)} />
          <Stat label="TAXI OUT" value={ofp.taxiOutMin != null ? `${ofp.taxiOutMin} min` : '—'} />
          <Stat label="TAXI IN" value={ofp.taxiInMin != null ? `${ofp.taxiInMin} min` : '—'} />
        </Section>
      )}

      {(ofp.originMetar || ofp.destinationMetar) && (
        <Section label="WEATHER" grid={false}>
          <div className="ofp-panel__metar-list">
            {ofp.originMetar && <div className="ofp-panel__metar">{ofp.originMetar}</div>}
            {ofp.destinationMetar && <div className="ofp-panel__metar">{ofp.destinationMetar}</div>}
          </div>
        </Section>
      )}

      {ofp.routeString && (
        <Section label="ROUTE" grid={false} last>
          <div className="ofp-panel__route-value">{ofp.routeString}</div>
        </Section>
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
