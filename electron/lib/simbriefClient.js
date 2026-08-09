// electron/lib/simbriefClient.js
//
// Pulls the pilot's most recent OFP from the public SimBrief API and
// normalizes it into just the fields FlightSync cares about — including
// enough geo/route data (lat/lon for origin, destination, and a handful of
// sampled waypoints) to draw a simple route map, plus the headline OFP
// numbers (distance, time enroute, cruise altitude, fuel, route string) for
// the OFP summary panel.

const SIMBRIEF_API = 'https://www.simbrief.com/api/xml.fetcher.php';
const FETCH_TIMEOUT_MS = 15000;

// Full navlog can have 50+ fixes on a long route — way too dense for a
// small route map. Sample down to a manageable number of points while
// always keeping the first and last (which get overridden with the exact
// origin/destination coordinates anyway).
const MAX_ROUTE_POINTS = 8;

/**
 * @typedef {Object} RoutePoint
 * @property {string} ident   fix/waypoint identifier
 * @property {number} lat
 * @property {number} lon
 *
 * @typedef {Object} FlightPlan
 * @property {string} origin           ICAO, e.g. "LTFM"
 * @property {string} destination      ICAO
 * @property {string[]} alternates     ICAO[]
 * @property {string} aircraftIcao     ICAO aircraft type, e.g. "A21N"
 * @property {string|null} airlineIcao ICAO airline code, e.g. "THY", or null for GA/private
 * @property {string} callsign
 * @property {string} fetchedAt        ISO timestamp
 * @property {{lat:number, lon:number}} originCoord
 * @property {{lat:number, lon:number}} destinationCoord
 * @property {RoutePoint[]} routePoints   sampled navlog fixes between origin and destination
 * @property {Object} ofp
 * @property {string} ofp.routeString      the filed route (airways/waypoints as text)
 * @property {number} ofp.distanceNm       air distance, nautical miles
 * @property {number} ofp.estTimeEnrouteSec
 * @property {number} ofp.cruiseAltitudeFt
 * @property {number} ofp.blockFuelLbs
 */

/**
 * @param {string} pilotIdOrUsername   SimBrief "pilot ID" or username
 * @returns {Promise<FlightPlan>}
 */
export async function fetchLatestOfp(pilotIdOrUsername) {
  const isNumeric = /^\d+$/.test(pilotIdOrUsername);
  const param = isNumeric ? 'userid' : 'username';
  const url = `${SIMBRIEF_API}?${param}=${encodeURIComponent(pilotIdOrUsername)}&json=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`SimBrief didn't respond within ${FETCH_TIMEOUT_MS / 1000}s — check your connection and try again.`);
    }
    throw new Error(`Couldn't reach SimBrief: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`SimBrief API returned ${res.status}. Check the pilot ID/username in Settings.`);
  }

  const data = await res.json();

  if (data?.fetch?.status && data.fetch.status !== 'Success') {
    throw new Error('No SimBrief OFP found for this pilot ID yet — generate one on simbrief.com first.');
  }

  if (!data?.origin?.icao_code || !data?.destination?.icao_code || !data?.aircraft?.icaocode) {
    throw new Error('This OFP is missing required route/aircraft data — try regenerating it on simbrief.com.');
  }

  const alternates = [
    data?.alternate?.icao_code,
    data?.alternate_extra?.icao_code,
  ].filter(Boolean);

  const originCoord = { lat: num(data?.origin?.pos_lat), lon: num(data?.origin?.pos_long) };
  const destinationCoord = { lat: num(data?.destination?.pos_lat), lon: num(data?.destination?.pos_long) };

  const routePoints = sampleRoutePoints(data?.navlog?.fix, MAX_ROUTE_POINTS);

  const callsign = data?.atc?.callsign
    || (data?.general?.icao_airline ? `${data.general.icao_airline}${data.general.flight_number ?? ''}` : null);

  return {
    origin: data?.origin?.icao_code,
    destination: data?.destination?.icao_code,
    alternates,
    aircraftIcao: data?.aircraft?.icaocode,
    airlineIcao: data?.general?.icao_airline || null,
    callsign,
    fetchedAt: new Date().toISOString(),
    source: 'simbrief',
    originCoord,
    destinationCoord,
    routePoints,
    ofp: {
      routeString: data?.general?.route || '',
      distanceNm: num(data?.general?.air_distance),
      gcDistanceNm: num(data?.general?.gc_distance),
      estTimeEnrouteSec: num(data?.times?.est_time_enroute),
      cruiseAltitudeFt: num(data?.general?.initial_altitude),
      blockFuelLbs: num(data?.fuel?.plan_ramp),
      tripFuelLbs: num(data?.fuel?.enroute_burn),
      taxiFuelLbs: num(data?.fuel?.taxi),
      reserveFuelLbs: num(data?.fuel?.reserve),
      alternateFuelLbs: num(data?.fuel?.alternate_burn),
      zfwLbs: num(data?.weights?.est_zfw),
      towLbs: num(data?.weights?.est_tow),
      landingWeightLbs: num(data?.weights?.est_ldw),
      maxTowLbs: num(data?.weights?.max_tow),
      paxCount: num(data?.weights?.pax_count),
      cargoLbs: num(data?.weights?.cargo),
      costIndex: num(data?.general?.costindex),
      avgWindComponent: data?.general?.avg_wind_comp ?? null,
      originName: data?.origin?.name || null,
      destinationName: data?.destination?.name || null,
      alternateName: data?.alternate?.name || null,
      alternateIcao: data?.alternate?.icao_code || null,
      originMetar: data?.origin?.metar || null,
      destinationMetar: data?.destination?.metar || null,
      taxiOutMin: num(data?.times?.taxi_out) != null ? Math.round(num(data.times.taxi_out) / 60) : null,
      taxiInMin: num(data?.times?.taxi_in) != null ? Math.round(num(data.times.taxi_in) / 60) : null,
      schedOutUtc: unixToTime(data?.times?.sched_out),
      schedInUtc: unixToTime(data?.times?.sched_in),
    },
  };
}

function unixToTime(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function sampleRoutePoints(fixes, maxPoints) {
  if (!Array.isArray(fixes) || fixes.length === 0) return [];

  const points = fixes
    .map(f => ({ ident: f?.ident, lat: num(f?.pos_lat), lon: num(f?.pos_long) }))
    .filter(p => p.ident && Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (points.length <= maxPoints) return points;

  const step = (points.length - 1) / (maxPoints - 1);
  const sampled = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
