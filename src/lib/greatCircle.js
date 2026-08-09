// src/lib/greatCircle.js
//
// Great-circle distance between two airports, reusing the same bundled
// ICAO -> coordinate dataset already shipped for the scenery map (see
// scripts/generate-airport-coords.mjs) — so a manually-entered or
// FlightRadar24-seeded route (neither of which carries SimBrief's own
// distance figure) can still get a real distance instead of just omitting
// it. Returns null rather than guessing when either ICAO isn't in the
// dataset (small/military fields aren't included).

const EARTH_RADIUS_NM = 3440.065;

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
 * @param {string} originIcao
 * @param {string} destinationIcao
 * @param {Record<string, [number, number]>} airportCoords  ICAO -> [lat, lon]
 * @returns {number|null} nautical miles, rounded, or null if either airport is unknown
 */
export function distanceForRoute(originIcao, destinationIcao, airportCoords) {
  const o = airportCoords[originIcao?.toUpperCase()];
  const d = airportCoords[destinationIcao?.toUpperCase()];
  if (!o || !d) return null;
  return Math.round(haversineNm(o[0], o[1], d[0], d[1]));
}
