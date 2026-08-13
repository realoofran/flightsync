import { describe, it, expect } from 'vitest';
import { matchControllersForAirport, findPilotFlightPlan, findFlightsByCallsign } from './vatsimClient.js';

// Real callsign conventions seen on the live VATSIM feed at time of
// writing: US airports use the 3-letter FAA-style local identifier
// (KBDL -> "BDL_TWR"), most everywhere else uses the ICAO code directly
// (EDDM -> "EDDM_TWR"), and enroute positions are named after the
// facility/region rather than any single airport.
const controllers = [
  { callsign: 'BDL_TWR', name: 'Bradley Tower', frequency: 120.3, facility: 4 },
  { callsign: 'BDL_GND', name: 'Bradley Ground', frequency: 121.9, facility: 3 },
  { callsign: 'EDDM_TWR', name: 'Munich Tower', frequency: 118.7, facility: 4 },
  { callsign: 'EDDM_APP', name: 'Munich Approach', frequency: 120.75, facility: 5 },
  { callsign: 'NY_CTR', name: 'New York Center', frequency: 135.15, facility: 6 },
  { callsign: 'JFK_TWR', name: 'JFK Tower', frequency: 119.1, facility: 4 },
];

describe('matchControllersForAirport', () => {
  it('matches an ICAO-prefixed callsign directly', () => {
    const matches = matchControllersForAirport('EDDM', controllers);
    expect(matches.map(c => c.callsign)).toEqual(['EDDM_TWR', 'EDDM_APP']);
  });

  it('matches the US "K"-stripped local identifier used in real VATSIM callsigns', () => {
    const matches = matchControllersForAirport('KBDL', controllers);
    expect(matches.map(c => c.callsign)).toEqual(['BDL_TWR', 'BDL_GND']);
  });

  it('matches KJFK the same way', () => {
    const matches = matchControllersForAirport('KJFK', controllers);
    expect(matches.map(c => c.callsign)).toEqual(['JFK_TWR']);
  });

  it('does not match an unrelated airport', () => {
    expect(matchControllersForAirport('LTFM', controllers)).toEqual([]);
  });

  it('does not match region-named enroute center positions', () => {
    const matches = matchControllersForAirport('KBDL', controllers);
    expect(matches.some(c => c.callsign === 'NY_CTR')).toBe(false);
  });

  it('is case-insensitive on the ICAO code', () => {
    expect(matchControllersForAirport('eddm', controllers).length).toBe(2);
  });

  it('returns an empty array for missing input instead of throwing', () => {
    expect(matchControllersForAirport(null, controllers)).toEqual([]);
    expect(matchControllersForAirport('EDDM', null)).toEqual([]);
    expect(matchControllersForAirport('EDDM', undefined)).toEqual([]);
  });

  it('ignores a controller entry with no callsign rather than crashing', () => {
    const withGarbage = [...controllers, { callsign: null, name: 'Broken', frequency: 0, facility: 0 }];
    expect(() => matchControllersForAirport('EDDM', withGarbage)).not.toThrow();
  });
});

// Real shape confirmed against a live pull of data.vatsim.net/v3/vatsim-data.json.
const pilots = [
  {
    cid: 1234567,
    name: 'Test Pilot',
    callsign: 'THY1598',
    server: 'GERMANY',
    flight_plan: {
      flight_rules: 'I',
      departure: 'ltfm',
      arrival: 'eddm',
      alternate: 'eddf',
      aircraft_short: 'a21n',
      route: 'EZS UP975 SOFIA UM984 BUD UZ29 ROKIL DCT EDDM',
    },
  },
  {
    cid: 7654321,
    name: 'No Flight Plan Pilot',
    callsign: 'N123AB',
    server: 'USA-E',
    flight_plan: null,
  },
  {
    cid: 9999999,
    name: 'GA Pilot',
    callsign: 'N456CD',
    server: 'USA-E',
    flight_plan: {
      flight_rules: 'V',
      departure: 'KBOS',
      arrival: 'KJFK',
      alternate: '',
      aircraft_short: 'C172',
      route: '',
    },
  },
];

describe('findPilotFlightPlan', () => {
  it('finds a pilot by CID and normalizes their filed flight plan', () => {
    const plan = findPilotFlightPlan(1234567, pilots);
    expect(plan).toEqual({
      origin: 'LTFM',
      destination: 'EDDM',
      alternates: ['EDDF'],
      aircraftIcao: 'A21N',
      airlineIcao: 'THY',
      callsign: 'THY1598',
      fetchedAt: expect.any(String),
      originCoord: null,
      destinationCoord: null,
      routePoints: [],
      ofp: null,
      source: 'vatsim',
    });
  });

  it('matches a CID passed as a string against a numeric cid in the feed', () => {
    expect(findPilotFlightPlan('1234567', pilots)).not.toBeNull();
  });

  it('tolerates surrounding whitespace in the entered CID', () => {
    expect(findPilotFlightPlan(' 1234567 ', pilots)).not.toBeNull();
  });

  it('returns null when the CID has no matching pilot online', () => {
    expect(findPilotFlightPlan(1111111, pilots)).toBeNull();
  });

  it('returns null when the pilot is online but has not filed a flight plan', () => {
    expect(findPilotFlightPlan(7654321, pilots)).toBeNull();
  });

  it('returns null for missing input instead of throwing', () => {
    expect(findPilotFlightPlan(null, pilots)).toBeNull();
    expect(findPilotFlightPlan(1234567, null)).toBeNull();
    expect(findPilotFlightPlan(1234567, undefined)).toBeNull();
  });

  it('leaves airlineIcao null for a GA/private callsign with no airline prefix pattern', () => {
    const plan = findPilotFlightPlan(9999999, pilots);
    expect(plan.airlineIcao).toBeNull();
    expect(plan.alternates).toEqual([]);
  });
});

describe('findFlightsByCallsign', () => {
  it('finds an exact callsign match, case-insensitively, with pilot/position extras attached', () => {
    const found = findFlightsByCallsign('thy1598', pilots);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      origin: 'LTFM',
      destination: 'EDDM',
      aircraftIcao: 'A21N',
      airlineIcao: 'THY',
      callsign: 'THY1598',
      source: 'vatsim-callsign',
      pilotName: 'Test Pilot',
      pilotCid: 1234567,
    });
  });

  it('falls back to a prefix match when no exact callsign is online', () => {
    // "THY159" isn't a full callsign anyone is using, but it's a prefix of
    // "THY1598" — surfacing it beats a dead end, same spirit as searching
    // "DLH" to see every Lufthansa flight currently online.
    const found = findFlightsByCallsign('THY159', pilots);
    expect(found.map((f) => f.callsign)).toEqual(['THY1598']);
  });

  it('prefers an exact match over prefix matches when both exist', () => {
    const withPrefixCollision = [
      ...pilots,
      { cid: 5555555, name: 'Other Pilot', callsign: 'THY15980', flight_plan: { departure: 'LTFM', arrival: 'LTBA', aircraft_short: 'A320' } },
    ];
    const found = findFlightsByCallsign('THY1598', withPrefixCollision);
    expect(found.map((f) => f.callsign)).toEqual(['THY1598']);
  });

  it('excludes pilots online with no filed flight plan', () => {
    const found = findFlightsByCallsign('N123AB', pilots);
    expect(found).toEqual([]);
  });

  it('reads live altitude/groundspeed when present, otherwise leaves them null', () => {
    const airborne = [
      { cid: 1111111, name: 'Airborne Pilot', callsign: 'DLH4LR', altitude: 37000, groundspeed: 450,
        flight_plan: { departure: 'EDDF', arrival: 'KJFK', aircraft_short: 'A21N' } },
    ];
    const found = findFlightsByCallsign('DLH4LR', airborne);
    expect(found[0].altitude).toBe(37000);
    expect(found[0].groundspeed).toBe(450);
    expect(findFlightsByCallsign('THY1598', pilots)[0].altitude).toBeNull();
  });

  it('caps results at 10 for a broad prefix search', () => {
    const manyPilots = Array.from({ length: 15 }, (_, i) => ({
      cid: i, name: `Pilot ${i}`, callsign: `DLH${i}`,
      flight_plan: { departure: 'EDDF', arrival: 'KJFK', aircraft_short: 'A21N' },
    }));
    expect(findFlightsByCallsign('DLH', manyPilots)).toHaveLength(10);
  });

  it('returns an empty array for empty/missing input instead of throwing', () => {
    expect(findFlightsByCallsign('', pilots)).toEqual([]);
    expect(findFlightsByCallsign(null, pilots)).toEqual([]);
    expect(findFlightsByCallsign('THY1598', null)).toEqual([]);
  });
});
