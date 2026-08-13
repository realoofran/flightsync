// electron/lib/vatsimClient.js
//
// VATSIM's network status feed (data.vatsim.net) is free, public, and
// explicitly meant for third-party consumption — unlike FlightRadar24 (see
// flightRadar24.js), there's no ToS concern here, so this module actually
// fetches live data rather than just parsing a pasted URL. Confirmed via
// direct testing that the feed returns 403 without a real User-Agent
// header, so one is always sent.
//
// Fetched fresh once per request, not polled continuously — VATSIM's feed
// itself only updates every ~15s server-side, and OfpPanel only needs a
// point-in-time "is anyone online at these airports right now" check, not
// a live subscription.

const VATSIM_DATA_URL = 'https://data.vatsim.net/v3/vatsim-data.json';
const FETCH_TIMEOUT_MS = 10000;
const USER_AGENT = 'FlightSync-DesktopApp/1.0 (+https://github.com/realoofran/flightsync)';

/**
 * @typedef {Object} VatsimController
 * @property {string} callsign    e.g. "BDL_TWR", "EDDM_APP"
 * @property {string} name
 * @property {number} frequency   MHz, e.g. 118.5
 * @property {number} facility    VATSIM facility type code (0=OBS, 1=FSS, 2=DEL, 3=GND, 4=TWR, 5=APP, 6=CTR)
 */

/**
 * Fetches and parses the full feed once — both fetchVatsimControllers and
 * fetchVatsimPilotFlightPlan need it, and there's no reason to make two
 * separate ~1MB round-trips for one user action.
 */
async function fetchVatsimData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(VATSIM_DATA_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`VATSIM didn't respond within ${FETCH_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Couldn't reach VATSIM: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`VATSIM data feed returned ${res.status}.`);
  }

  return res.json();
}

/**
 * @returns {Promise<VatsimController[]>}
 */
export async function fetchVatsimControllers() {
  const data = await fetchVatsimData();
  return (data?.controllers ?? []).map((c) => ({
    callsign: c.callsign,
    name: c.name,
    frequency: c.frequency,
    facility: c.facility,
  }));
}

/**
 * Looks up the given CID's own live pilot session and, if they've filed a
 * flight plan, returns it fetched fresh from the network — a third source
 * for the sync engine alongside SimBrief and manual entry. Only origin,
 * destination, and aircraft type come through reliably; VATSIM's feed
 * carries no OFP-style weights/fuel figures and no navlog, so `ofp` is
 * left null (RouteMap/OfpPanel already handle that — see ManualRouteForm,
 * which produces the same shape). Distance still gets computed via the
 * bundled great-circle dataset on the renderer side rather than left blank.
 *
 * @param {string|number} cid
 * @returns {Promise<import('./simbriefClient.js').FlightPlan|null>} null if this CID has no pilot session with a filed plan online right now
 */
export async function fetchVatsimPilotFlightPlan(cid) {
  const data = await fetchVatsimData();
  return findPilotFlightPlan(cid, data?.pilots ?? []);
}

/**
 * Maps one VATSIM `pilots[]` entry with a filed flight plan onto
 * FlightSync's FlightPlan shape (see simbriefClient.js) — shared by both
 * findPilotFlightPlan (CID lookup) and findFlightsByCallsign (callsign
 * search) below so the two don't drift apart. Caller has already checked
 * `pilot.flight_plan.departure`/`.arrival` exist.
 */
function corePlanFromPilot(pilot) {
  const fp = pilot.flight_plan;
  // VATSIM callsigns follow the same airline-code + flight-number
  // convention real ICAO callsigns use (e.g. "THY1598") — extracting the
  // leading letters is the same heuristic FlightRadar24 parsing already
  // relies on (see flightRadar24.js), just applied to a different source.
  const airlineMatch = pilot.callsign?.match(/^([A-Z]{2,3})\d/);

  return {
    origin: fp.departure.toUpperCase(),
    destination: fp.arrival.toUpperCase(),
    alternates: fp.alternate ? [fp.alternate.toUpperCase()] : [],
    aircraftIcao: (fp.aircraft_short || '').toUpperCase(),
    airlineIcao: airlineMatch ? airlineMatch[1] : null,
    callsign: pilot.callsign || null,
    fetchedAt: new Date().toISOString(),
    originCoord: null,
    destinationCoord: null,
    routePoints: [],
    ofp: null,
    source: 'vatsim',
  };
}

/**
 * Pure matching/normalizing logic, split out from fetchVatsimPilotFlightPlan
 * so it's testable without a network call.
 *
 * @param {string|number} cid
 * @param {Array} pilots  raw VATSIM `pilots[]` entries
 */
export function findPilotFlightPlan(cid, pilots) {
  if (!cid) return null;
  const pilot = (pilots ?? []).find((p) => String(p?.cid) === String(cid).trim());
  if (!pilot) return null;

  const fp = pilot.flight_plan;
  if (!fp?.departure || !fp?.arrival) return null;

  return corePlanFromPilot(pilot);
}

export async function fetchVatsimFlightsByCallsign(query) {
  const data = await fetchVatsimData();
  return findFlightsByCallsign(query, data?.pilots ?? []);
}

/**
 * Callsign-based search across every pilot currently online with a filed
 * flight plan. Unlike findPilotFlightPlan (which only ever looks up YOUR
 * OWN CID, for auto-sync), this is for browsing/picking a specific flight
 * by callsign — e.g. "DLH4LR" — so each result carries a few extra
 * display-only fields (pilot name, live altitude/groundspeed) on top of
 * the core FlightPlan shape, for the search-results list to show. An
 * exact callsign match is preferred; if none is online right now, falls
 * back to a prefix match so searching "DLH" surfaces every Lufthansa
 * flight currently active instead of a dead end. Capped at 10 results —
 * this is a picker, not a full network browser.
 *
 * @param {string} query
 * @param {Array} pilots  raw VATSIM `pilots[]` entries
 * @returns {Array<import('./simbriefClient.js').FlightPlan & {pilotName: string|null, pilotCid: number|null, altitude: number|null, groundspeed: number|null}>}
 */
export function findFlightsByCallsign(query, pilots) {
  const q = (query ?? '').trim().toUpperCase();
  if (!q) return [];

  const withPlans = (pilots ?? []).filter(
    (p) => p?.callsign && p?.flight_plan?.departure && p?.flight_plan?.arrival,
  );

  const exact = withPlans.filter((p) => p.callsign.toUpperCase() === q);
  const matches = exact.length > 0 ? exact : withPlans.filter((p) => p.callsign.toUpperCase().startsWith(q));

  return matches.slice(0, 10).map((pilot) => ({
    ...corePlanFromPilot(pilot),
    // Distinct from plain 'vatsim' (which means "this user's own CID pull",
    // and drives SyncView's refresh button to re-pull that same CID) — a
    // callsign search can load someone else's flight entirely, so it must
    // never wire up to that refresh path. Still genuinely live VATSIM data
    // for display purposes (FlightStrip's "LIVE ON VATSIM" tag etc).
    source: 'vatsim-callsign',
    pilotName: pilot.name || null,
    pilotCid: pilot.cid ?? null,
    altitude: typeof pilot.altitude === 'number' ? pilot.altitude : null,
    groundspeed: typeof pilot.groundspeed === 'number' ? pilot.groundspeed : null,
  }));
}

/**
 * Matches online controllers to a specific airport by callsign prefix (the
 * text before the first underscore) — VATSIM's feed has no direct
 * "airport" field on a controller entry, so this is the only real signal
 * available. Handles the common US case where the local FAA identifier
 * used in callsigns is the ICAO code with its leading "K" dropped (e.g.
 * KBDL -> "BDL_TWR", not "KBDL_TWR"); everywhere else, VATSIM callsigns
 * are conventionally the ICAO code itself. Enroute center/FSS positions
 * are named after the facility/region rather than a single airport, so
 * they naturally won't match here — that's intentional, not a gap: this
 * is meant to answer "is there a controller staffing THIS airport", not
 * "is this airport inside a staffed center's airspace".
 *
 * @param {string} icao
 * @param {VatsimController[]} controllers
 * @returns {VatsimController[]}
 */
export function matchControllersForAirport(icao, controllers) {
  if (!icao) return [];
  const upper = icao.toUpperCase();
  const local = upper.length === 4 && upper.startsWith('K') ? upper.slice(1) : null;

  return (controllers ?? []).filter((c) => {
    const prefix = c.callsign?.split('_')[0]?.toUpperCase();
    if (!prefix) return false;
    return prefix === upper || (local && prefix === local);
  });
}
