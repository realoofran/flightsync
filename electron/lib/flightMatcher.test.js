import { describe, it, expect } from 'vitest';
import { resolveRequiredAddons, findPendingConfirmations } from './flightMatcher.js';

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
