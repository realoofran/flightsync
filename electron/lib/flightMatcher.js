// electron/lib/flightMatcher.js
//
// Pure function: (FlightPlan, Addon[]) -> Addon[] required for that flight.
// No filesystem access here on purpose — keeps this trivially unit-testable.

const EARTH_RADIUS_NM = 3440.065;

// How close a route waypoint needs to be to an airport for its scenery to
// count as "enroute" — a real design decision, not an arbitrary number:
// 40nm is roughly the distance a large/medium airport's scenery becomes
// visually relevant from cruise altitude, without pulling in every airport
// along a long-haul route's entire path (that would make "enroute" mean
// "everywhere," defeating the point).
export const ENROUTE_RADIUS_NM = 40;

function haversineNm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/**
 * ICAO codes (from `airportCoords`) within ENROUTE_RADIUS_NM of any sampled
 * route waypoint. Only ever non-empty for plans that actually carry
 * waypoints — SimBrief plans do (see simbriefClient.js's sampleRoutePoints);
 * manual entry and VATSIM-pulled plans don't, so this is a no-op for those,
 * same as `ofp` being null already degrades gracefully for them elsewhere.
 *
 * @param {{lat: number, lon: number}[]} routePoints
 * @param {Record<string, [number, number]>} airportCoords ICAO -> [lat, lon]
 * @returns {Set<string>}
 */
export function findEnrouteIcaos(routePoints, airportCoords) {
  const found = new Set();
  if (!routePoints?.length || !airportCoords) return found;

  for (const point of routePoints) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) continue;
    for (const [icao, [lat, lon]] of Object.entries(airportCoords)) {
      if (haversineNm(point.lat, point.lon, lat, lon) <= ENROUTE_RADIUS_NM) {
        found.add(icao);
      }
    }
  }
  return found;
}

/**
 * @param {import('./simbriefClient.js').FlightPlan} plan
 * @param {import('./addonScanner.js').Addon[]} library
 * @param {{ includeAlternates: boolean, includeEnroute?: boolean, airportCoords?: Record<string, [number, number]> }} options
 * @returns {import('./addonScanner.js').Addon[]}
 */
export function resolveRequiredAddons(plan, library, options = { includeAlternates: true }) {
  const requiredIcaos = new Set([plan.origin, plan.destination]);
  if (options.includeAlternates) {
    for (const alt of plan.alternates) requiredIcaos.add(alt);
  }
  if (options.includeEnroute) {
    for (const icao of findEnrouteIcaos(plan.routePoints, options.airportCoords)) {
      requiredIcaos.add(icao);
    }
  }

  // nameConflict addons share a folder name with another addon in the
  // library — MSFS can only ever link one of them, so auto-syncing either
  // one would be a guess. Excluded here; the Library view surfaces the
  // conflict so the user can rename one and rescan.
  const scenery = library.filter(a =>
    a.contentType === 'SCENERY' &&
    a.confirmed &&
    !a.nameConflict &&
    a.matchedIcao &&
    requiredIcaos.has(a.matchedIcao)
  );

  const aircraft = library.filter(a =>
    a.contentType === 'AIRCRAFT' &&
    a.confirmed &&
    !a.nameConflict &&
    a.matchedAircraftType === plan.aircraftIcao
  );

  // Livery matching is stricter: needs BOTH the airline and aircraft type to
  // match, since a wrong-airline livery for the right aircraft is actively
  // wrong (not just unnecessary) and would leave the aircraft looking odd
  // in a VATSIM session.
  const liveries = library.filter(a =>
    a.contentType === 'LIVERY' &&
    a.confirmed &&
    !a.nameConflict &&
    a.matchedAircraftType === plan.aircraftIcao &&
    (plan.airlineIcao ? a.matchedAirline === plan.airlineIcao : true)
  );

  return [...scenery, ...aircraft, ...liveries];
}

/**
 * Addons that matched an ICAO required by the plan but are NOT yet
 * `confirmed` — surfaced in the UI as "needs your confirmation before this
 * can be synced automatically." Takes the same enroute options as
 * resolveRequiredAddons so an unconfirmed enroute-proximate match gets
 * surfaced too, not just origin/destination/alternates.
 */
export function findPendingConfirmations(plan, library, options = {}) {
  const requiredIcaos = new Set([plan.origin, plan.destination, ...plan.alternates]);
  if (options.includeEnroute) {
    for (const icao of findEnrouteIcaos(plan.routePoints, options.airportCoords)) {
      requiredIcaos.add(icao);
    }
  }
  return library.filter(a =>
    !a.confirmed &&
    a.contentType === 'SCENERY' &&
    a.candidateIcaos.some(icao => requiredIcaos.has(icao))
  );
}
