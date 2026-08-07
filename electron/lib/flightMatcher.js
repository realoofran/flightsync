// electron/lib/flightMatcher.js
//
// Pure function: (FlightPlan, Addon[]) -> Addon[] required for that flight.
// No filesystem access here on purpose — keeps this trivially unit-testable.

/**
 * @param {import('./simbriefClient.js').FlightPlan} plan
 * @param {import('./addonScanner.js').Addon[]} library
 * @param {{ includeAlternates: boolean }} options
 * @returns {import('./addonScanner.js').Addon[]}
 */
export function resolveRequiredAddons(plan, library, options = { includeAlternates: true }) {
  const requiredIcaos = new Set([plan.origin, plan.destination]);
  if (options.includeAlternates) {
    for (const alt of plan.alternates) requiredIcaos.add(alt);
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
 * can be synced automatically."
 */
export function findPendingConfirmations(plan, library) {
  const requiredIcaos = new Set([plan.origin, plan.destination, ...plan.alternates]);
  return library.filter(a =>
    !a.confirmed &&
    a.contentType === 'SCENERY' &&
    a.candidateIcaos.some(icao => requiredIcaos.has(icao))
  );
}
