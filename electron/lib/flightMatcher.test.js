import { describe, it, expect } from 'vitest';
import { resolveRequiredAddons, findPendingConfirmations, findEnrouteIcaos, ENROUTE_RADIUS_NM } from './flightMatcher.js';

function addon(overrides) {
  return {
    id: 'x',
    folderName: 'x',
    contentType: 'SCENERY',
    confirmed: true,
    nameConflict: false,
    candidateIcaos: [],
    matchedIcao: null,
    matchedAircraftType: null,
    matchedAirline: null,
    ...overrides,
  };
}

const plan = {
  origin: 'LTFM',
  destination: 'EDDM',
  alternates: ['EDDF'],
  aircraftIcao: 'A21N',
  airlineIcao: 'THY',
};

describe('resolveRequiredAddons', () => {
  it('includes scenery matching origin, destination, and alternates', () => {
    const library = [
      addon({ id: 'origin', matchedIcao: 'LTFM' }),
      addon({ id: 'dest', matchedIcao: 'EDDM' }),
      addon({ id: 'altn', matchedIcao: 'EDDF' }),
      addon({ id: 'unrelated', matchedIcao: 'KJFK' }),
    ];
    const required = resolveRequiredAddons(plan, library);
    expect(required.map(a => a.id).sort()).toEqual(['altn', 'dest', 'origin']);
  });

  it('excludes alternates when includeAlternates is false', () => {
    const library = [addon({ id: 'altn', matchedIcao: 'EDDF' })];
    const required = resolveRequiredAddons(plan, library, { includeAlternates: false });
    expect(required).toEqual([]);
  });

  it('excludes unconfirmed and name-conflicted scenery even if the ICAO matches', () => {
    const library = [
      addon({ id: 'unconfirmed', matchedIcao: 'LTFM', confirmed: false }),
      addon({ id: 'conflicted', matchedIcao: 'LTFM', nameConflict: true }),
    ];
    expect(resolveRequiredAddons(plan, library)).toEqual([]);
  });

  it('matches aircraft by type only', () => {
    const library = [addon({ id: 'ac', contentType: 'AIRCRAFT', matchedAircraftType: 'A21N' })];
    expect(resolveRequiredAddons(plan, library).map(a => a.id)).toEqual(['ac']);
  });

  it('requires both aircraft type AND airline for liveries', () => {
    const library = [
      addon({ id: 'right-livery', contentType: 'LIVERY', matchedAircraftType: 'A21N', matchedAirline: 'THY' }),
      addon({ id: 'wrong-airline', contentType: 'LIVERY', matchedAircraftType: 'A21N', matchedAirline: 'PGT' }),
      addon({ id: 'wrong-aircraft', contentType: 'LIVERY', matchedAircraftType: 'A320', matchedAirline: 'THY' }),
    ];
    expect(resolveRequiredAddons(plan, library).map(a => a.id)).toEqual(['right-livery']);
  });

  it('matches a GA/private livery with no airline when the plan has none', () => {
    const gaPlan = { ...plan, airlineIcao: null };
    const library = [addon({ id: 'ga', contentType: 'LIVERY', matchedAircraftType: 'A21N', matchedAirline: null })];
    expect(resolveRequiredAddons(gaPlan, library).map(a => a.id)).toEqual(['ga']);
  });
});

describe('findPendingConfirmations', () => {
  it('surfaces unconfirmed scenery whose candidate ICAOs overlap the route', () => {
    const library = [
      addon({ id: 'pending', confirmed: false, candidateIcaos: ['LTFM', 'ORBX'] }),
      addon({ id: 'irrelevant', confirmed: false, candidateIcaos: ['KJFK'] }),
      addon({ id: 'already-confirmed', confirmed: true, candidateIcaos: ['LTFM'] }),
    ];
    expect(findPendingConfirmations(plan, library).map(a => a.id)).toEqual(['pending']);
  });
});

// A route point over southern Germany, plus real Munich/Nuremberg
// coordinates at cross-checked haversine distances from it (computed
// against the same formula findEnrouteIcaos uses, before writing
// assertions) — 38.0nm and 90.0nm respectively. Deliberately keyed under
// fake ICAOs (EDXM/EDXN) rather than the real EDDM/EDDN codes: the shared
// `plan` fixture above already uses EDDM as its destination, and reusing
// it here would match unconditionally via the ordinary destination-ICAO
// path regardless of enroute logic, silently making these tests pass for
// the wrong reason.
const routePoints = [{ ident: 'WPT1', lat: 48.0, lon: 11.0 }];
const airportCoords = {
  EDXM: [48.3538, 11.7861], // 38.0nm from the route point — inside the radius
  EDXN: [49.4987, 11.0780], // 90.0nm from the route point — just outside
  LTFM: [41.2749, 28.7321], // 855.6nm — clear control, and IS the plan's own origin
};

describe('findEnrouteIcaos', () => {
  it('uses a 40nm radius', () => {
    expect(ENROUTE_RADIUS_NM).toBe(40);
  });

  it('includes an airport within the enroute radius and excludes one just outside it', () => {
    const found = findEnrouteIcaos(routePoints, airportCoords);
    expect(found.has('EDXM')).toBe(true);
    expect(found.has('EDXN')).toBe(false);
    expect(found.has('LTFM')).toBe(false);
  });

  it('is a no-op for a plan with no route points (manual entry, VATSIM)', () => {
    expect(findEnrouteIcaos([], airportCoords)).toEqual(new Set());
    expect(findEnrouteIcaos(undefined, airportCoords)).toEqual(new Set());
    expect(findEnrouteIcaos(null, airportCoords)).toEqual(new Set());
  });

  it('is a no-op when no airport coordinate dataset is provided', () => {
    expect(findEnrouteIcaos(routePoints, undefined)).toEqual(new Set());
  });

  it('ignores a malformed route point instead of throwing', () => {
    expect(() => findEnrouteIcaos([{ ident: 'BAD' }], airportCoords)).not.toThrow();
  });
});

describe('resolveRequiredAddons — enroute matching', () => {
  const enroutePlan = { ...plan, routePoints };

  it('matches enroute scenery only when includeEnroute is explicitly on', () => {
    const library = [addon({ id: 'munich', matchedIcao: 'EDXM' })];
    expect(resolveRequiredAddons(enroutePlan, library, { includeAlternates: true }).map(a => a.id)).toEqual([]);
    expect(
      resolveRequiredAddons(enroutePlan, library, { includeAlternates: true, includeEnroute: true, airportCoords }).map(a => a.id)
    ).toEqual(['munich']);
  });

  it('does not enroute-match an airport outside the radius', () => {
    const library = [addon({ id: 'nuremberg', matchedIcao: 'EDXN' })];
    expect(
      resolveRequiredAddons(enroutePlan, library, { includeAlternates: true, includeEnroute: true, airportCoords }).map(a => a.id)
    ).toEqual([]);
  });

  it('still excludes unconfirmed or name-conflicted enroute matches, same as any other scenery', () => {
    const library = [addon({ id: 'unconfirmed', matchedIcao: 'EDXM', confirmed: false })];
    expect(
      resolveRequiredAddons(enroutePlan, library, { includeAlternates: true, includeEnroute: true, airportCoords }).map(a => a.id)
    ).toEqual([]);
  });
});

describe('findPendingConfirmations — enroute matching', () => {
  it('surfaces an unconfirmed enroute-proximate match only when includeEnroute is on', () => {
    const enroutePlan = { ...plan, routePoints };
    const library = [addon({ id: 'pending-enroute', confirmed: false, candidateIcaos: ['EDXM'] })];
    expect(findPendingConfirmations(enroutePlan, library).map(a => a.id)).toEqual([]);
    expect(
      findPendingConfirmations(enroutePlan, library, { includeEnroute: true, airportCoords }).map(a => a.id)
    ).toEqual(['pending-enroute']);
  });
});
