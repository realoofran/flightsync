// src/lib/flightRadar24.js
//
// Pulls a flight/callsign code out of a pasted FlightRadar24 URL — pure
// string parsing of the URL text itself, NO network request to
// flightradar24.com. FlightRadar24's real flight-data API is a paid
// commercial product (fr24api.flightradar24.com), and scraping their
// live-tracking pages would be fragile (breaks the moment their page
// structure changes) and against their terms of service for a publicly
// distributed app to do automatically. So this deliberately reads only
// what's already sitting in the URL text you pasted — the flight/callsign
// code — the same way you'd read it off the page yourself. You still fill
// in the route/aircraft from what you see on the FR24 page.
//
// Confirmed real FR24 URL shapes (checked against live search results):
//   https://www.flightradar24.com/data/flights/ua1608
//   https://www.flightradar24.com/data/flights/vn18#2314b545
//   https://data.flightradar24.com/data/flights/d0161
//   https://free.flightradar24.com/data/flights/ac834

// IATA (2-char) -> ICAO (3-char) airline code, covering the airlines this
// app already recognizes elsewhere (countryFlags.js, addonScanner.js) so a
// resolved airline stays consistent with the rest of FlightSync's matching.
const IATA_TO_ICAO_AIRLINE = {
  TK: 'THY', PC: 'PGT', LH: 'DLH', DE: 'CFG', EK: 'UAE', QR: 'QTR',
  BA: 'BAW', AF: 'AFR', UA: 'UAL', DL: 'DAL', FR: 'RYR', U2: 'EZY',
  KL: 'KLM', IB: 'IBE', LX: 'SWR', OS: 'AUA', W6: 'WZZ', VY: 'VLG',
  DY: 'NAX', SK: 'SAS', AY: 'FIN', SU: 'AFL', AA: 'AAL', WN: 'SWA',
  B6: 'JBU', AS: 'ASA', AC: 'ACA', CX: 'CPA', NH: 'ANA', JL: 'JAL',
  SQ: 'SIA', QF: 'QFA', EY: 'ETD', SV: 'SVA', VN: 'HVN',
};

/**
 * @param {string} url  a pasted FlightRadar24 link
 * @returns {{flightCode: string, airlineIcao: string|null}|null}
 *   null if the URL isn't a recognizable flightradar24.com flight link.
 */
export function parseFlightRadar24Url(url) {
  if (!url || typeof url !== 'string') return null;

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (!/(^|\.)flightradar24\.com$/i.test(parsed.hostname)) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) return null;

  // The FR24-assigned hex/aircraft id sometimes rides in the hash
  // (#2314b545) or appended after a '#' in the path segment itself —
  // strip either, we only want the flight/callsign code.
  const flightCode = lastSegment.split('#')[0].toUpperCase();
  if (!/^[A-Z0-9]{3,8}$/.test(flightCode)) return null;

  const iataPrefix = flightCode.slice(0, 2);
  const airlineIcao = IATA_TO_ICAO_AIRLINE[iataPrefix] ?? null;

  return { flightCode, airlineIcao };
}
