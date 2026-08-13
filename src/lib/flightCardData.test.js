import { describe, it, expect } from 'vitest';
import { buildFlightCardData } from './flightCardData.js';

describe('buildFlightCardData', () => {
  it('builds a full card from a complete SimBrief-style plan', () => {
    const plan = {
      origin: 'LTFM',
      destination: 'EDDM',
      alternates: ['EDDF'],
      aircraftIcao: 'A21N',
      airlineIcao: 'THY',
      callsign: 'THY1598',
      source: 'simbrief',
      ofp: { distanceNm: 897.4 },
    };
    const data = buildFlightCardData(plan, 4);
    expect(data.callsign).toBe('THY1598');
    expect(data.route).toBe('LTFM → EDDM');
    expect(data.aircraftIcao).toBe('A21N');
    expect(data.airlineIcao).toBe('THY');
    expect(data.alternates).toEqual(['EDDF']);
    expect(data.distanceLabel).toBe('897 NM');
    expect(data.liveVatsim).toBe(false);
    expect(data.addonCount).toBe(4);
  });

  it('flags liveVatsim only when the plan actually came from VATSIM', () => {
    expect(buildFlightCardData({ source: 'vatsim' }).liveVatsim).toBe(true);
    // A callsign-search result is still genuinely live VATSIM data, just a
    // distinct source string so it doesn't wire into the "re-pull my own
    // CID" refresh handler — see vatsimClient.js's findFlightsByCallsign.
    expect(buildFlightCardData({ source: 'vatsim-callsign' }).liveVatsim).toBe(true);
    expect(buildFlightCardData({ source: 'simbrief' }).liveVatsim).toBe(false);
    expect(buildFlightCardData({ source: 'manual' }).liveVatsim).toBe(false);
  });

  it('falls back to aircraft type, then a generic label, when no callsign was filed', () => {
    expect(buildFlightCardData({ aircraftIcao: 'C172' }).callsign).toBe('C172');
    expect(buildFlightCardData({}).callsign).toBe('FLIGHT');
  });

  it('omits the distance line rather than showing 0 NM when unknown', () => {
    expect(buildFlightCardData({ origin: 'KJFK', destination: 'EGLL' }).distanceLabel).toBeNull();
  });

  it('never throws on a bare/empty plan', () => {
    expect(() => buildFlightCardData(null)).not.toThrow();
    expect(() => buildFlightCardData(undefined)).not.toThrow();
    expect(buildFlightCardData(null).route).toBe('???? → ????');
  });
});
