// src/lib/flightCardData.js
//
// Pure data-shaping for the shareable flight card (see flightCardRenderer.js
// for the actual canvas drawing) — kept separate so the "what goes on the
// card and how it's worded" logic is unit-testable without a canvas/DOM.

/**
 * @param {import('./greatCircle.js').FlightPlan} plan
 * @param {number} addonCount   how many addons this route's sync plan touches, 0 if unknown
 * @returns {{
 *   callsign: string,
 *   route: string,
 *   aircraftIcao: string,
 *   airlineIcao: string|null,
 *   alternates: string[],
 *   distanceLabel: string|null,
 *   liveVatsim: boolean,
 *   addonCount: number,
 *   generatedAt: string,
 * }}
 */
export function buildFlightCardData(plan, addonCount = 0) {
  const distanceNm = plan?.ofp?.distanceNm ?? null;
  return {
    callsign: plan?.callsign || plan?.aircraftIcao || 'FLIGHT',
    route: `${plan?.origin ?? '????'} → ${plan?.destination ?? '????'}`,
    aircraftIcao: plan?.aircraftIcao || '—',
    airlineIcao: plan?.airlineIcao || null,
    alternates: plan?.alternates ?? [],
    distanceLabel: distanceNm ? `${Math.round(distanceNm).toLocaleString()} NM` : null,
    liveVatsim: plan?.source === 'vatsim',
    addonCount,
    generatedAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
  };
}
