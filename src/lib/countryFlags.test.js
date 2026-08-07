import { describe, it, expect } from 'vitest';
import { countryForFlight, countryForIcao } from './countryFlags.js';

describe('countryForFlight', () => {
  it('prefers the operating airline over the origin airport', () => {
    expect(countryForFlight({ airlineIcao: 'THY', origin: 'EDDM' })).toBe(countryForIcao('LTFM'));
  });

  it('falls back to the origin airport when there is no airline (GA/private)', () => {
    expect(countryForFlight({ airlineIcao: null, origin: 'KJFK' })).toBe(countryForIcao('KJFK'));
  });

  it('returns null for no plan', () => {
    expect(countryForFlight(null)).toBeNull();
  });
});

describe('countryForIcao', () => {
  it('resolves a two-letter European prefix before falling back to a one-letter prefix', () => {
    // "LT" (Turkey) must win over any broader single-letter fallback.
    expect(countryForIcao('LTFM')).toBe(countryForIcao('LTAI'));
    expect(countryForIcao('LTFM')).toBe('TR');
  });

  it('resolves single-letter continental prefixes (US/Canada/Australia)', () => {
    expect(countryForIcao('KJFK')).toBe('US');
    expect(countryForIcao('CYYZ')).toBe('CA');
    expect(countryForIcao('YSSY')).toBe('AU');
  });

  it('returns null for an unrecognized prefix', () => {
    expect(countryForIcao('ZZZZ')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(countryForIcao('')).toBeNull();
    expect(countryForIcao(null)).toBeNull();
  });
});
